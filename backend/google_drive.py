"""
google_drive.py — Resume upload/delete via Google OAuth 2.0 (refresh token).

Setup:
  1. Go to https://console.cloud.google.com/
     - Create (or reuse) a project → Enable the Drive API
     - APIs & Services → Credentials → Create Credentials → OAuth client ID
       - Application type: Desktop app  →  Download the JSON (client_id + client_secret)

  2. Get a refresh token via OAuth Playground:
     - Open https://developers.google.com/oauthplayground/
     - Click the gear icon (top-right) → check "Use your own OAuth credentials"
       → paste your Client ID and Client Secret → close gear
     - In Step 1, type "https://www.googleapis.com/auth/drive" → click Authorize APIs
     - Sign in with the Google account that OWNS the target Drive folder
     - Step 2 → "Exchange authorization code for tokens" → copy the refresh_token

  3. Create a folder in your personal Google Drive (or My Drive root is fine).
     Copy the folder ID from the URL:
       https://drive.google.com/drive/folders/<FOLDER_ID>

  4. Set these env vars (HuggingFace Secrets or .env):
       GOOGLE_CLIENT_ID      = <OAuth client_id>
       GOOGLE_CLIENT_SECRET  = <OAuth client_secret>
       GOOGLE_REFRESH_TOKEN  = <refresh_token from step 2>
       GOOGLE_DRIVE_FOLDER_ID = <folder ID from step 3>  (optional but recommended)
"""

import os
import io
import json
import re
import logging

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/drive"]

ALLOWED_MIME_TYPES = {
    "application/pdf":                                                          "pdf",
    "application/msword":                                                       "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
}

MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB


def _get_service():
    """Build and return an authenticated Drive v3 service via OAuth refresh token."""
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
    except ImportError:
        raise RuntimeError(
            "Google client libraries not installed. "
            "Run: pip install google-api-python-client google-auth"
        )

    client_id     = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()
    refresh_token = os.environ.get("GOOGLE_REFRESH_TOKEN", "").strip()

    missing = [k for k, v in {
        "GOOGLE_CLIENT_ID":     client_id,
        "GOOGLE_CLIENT_SECRET": client_secret,
        "GOOGLE_REFRESH_TOKEN": refresh_token,
    }.items() if not v]
    if missing:
        raise RuntimeError(
            f"Missing required env vars: {', '.join(missing)}. "
            "See google_drive.py docstring for setup instructions."
        )

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri="https://oauth2.googleapis.com/token",
    )
    # Force-refresh so we have a valid access token before making API calls
    creds.refresh(Request())
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def upload_resume(file_bytes: bytes, filename: str, mime_type: str) -> dict:
    """
    Upload a resume file to Google Drive.

    Returns:
        {
          "file_id":    str,   # Drive file ID (for future deletion)
          "preview_url": str,  # Embeddable preview URL (stored in Supabase)
          "view_url":   str,   # Direct link that opens in Drive
        }
    """
    from googleapiclient.errors import HttpError
    from googleapiclient.http import MediaIoBaseUpload

    service   = _get_service()
    folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "").strip()

    metadata: dict = {"name": filename}
    if folder_id:
        metadata["parents"] = [folder_id]

    media = MediaIoBaseUpload(
        io.BytesIO(file_bytes), mimetype=mime_type, resumable=False
    )
    try:
        created = service.files().create(
            body=metadata,
            media_body=media,
            fields="id,name",
            supportsAllDrives=True,
        ).execute()
    except HttpError as exc:
        details = _extract_drive_error(exc)
        if _is_storage_quota_error(details):
            raise RuntimeError(
                "Google Drive rejected the upload: storage quota exceeded. "
                "Free up space in your Google Drive or upgrade your storage plan."
            ) from exc
        raise RuntimeError(f"Google Drive upload failed: {details}") from exc

    file_id = created["id"]

    # Make it viewable by anyone with the link
    service.permissions().create(
        fileId=file_id,
        body={"type": "anyone", "role": "reader"},
        fields="id",
        supportsAllDrives=True,
    ).execute()

    view_url    = f"https://drive.google.com/file/d/{file_id}/view"
    preview_url = f"https://drive.google.com/file/d/{file_id}/preview"

    logger.info(f"[Drive] Uploaded '{filename}' → {file_id}")
    return {"file_id": file_id, "preview_url": preview_url, "view_url": view_url}


def delete_resume(drive_url: str) -> bool:
    """
    Delete a Drive file given its preview_url or view_url stored in Supabase.
    Extracts the file ID from the URL automatically.
    Returns True if deleted, False if file ID couldn't be parsed or deletion failed.
    """
    match = re.search(r"/file/d/([^/?#]+)", drive_url or "")
    if not match:
        return False

    file_id = match.group(1)
    try:
        service = _get_service()
        service.files().delete(fileId=file_id).execute()
        logger.info(f"[Drive] Deleted file {file_id}")
        return True
    except Exception as exc:
        logger.warning(f"[Drive] Could not delete {file_id}: {exc}")
        return False


def _extract_drive_error(exc: Exception) -> str:
    content = getattr(exc, "content", b"") or b""
    if isinstance(content, bytes):
        content = content.decode("utf-8", errors="ignore")

    try:
        payload = json.loads(content) if content else {}
    except json.JSONDecodeError:
        payload = {}

    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = error.get("message")
            if message:
                return str(message)

    return str(exc)


def _is_storage_quota_error(message: str) -> bool:
    normalized = (message or "").lower()
    return "storage quota" in normalized or "storagequotaexceeded" in normalized
