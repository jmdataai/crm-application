"""
google_drive.py — Resume upload/delete via Google Service Account.

Setup:
  1. Create a Google Cloud project → Enable the Drive API
  2. Create a Service Account → Download JSON key
  3. Create a folder in Google Drive → Share it with the service account email (Editor)
  4. Set env vars:
       GOOGLE_SERVICE_ACCOUNT_JSON = <entire contents of the JSON key file>
       GOOGLE_DRIVE_FOLDER_ID      = <folder ID from the Drive URL>
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
    """Build and return an authenticated Drive v3 service."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        raise RuntimeError(
            "Google client libraries not installed. "
            "Run: pip install google-api-python-client google-auth"
        )

    creds_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if not creds_json:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON env var is not set.")

    creds_info = json.loads(creds_json)
    creds = service_account.Credentials.from_service_account_info(
        creds_info, scopes=SCOPES
    )
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
    from googleapiclient.http import MediaIoBaseUpload

    service   = _get_service()
    folder_id = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "").strip()

    metadata: dict = {"name": filename}
    if folder_id:
        metadata["parents"] = [folder_id]

    media = MediaIoBaseUpload(
        io.BytesIO(file_bytes), mimetype=mime_type, resumable=False
    )
    created = service.files().create(
        body=metadata,
        media_body=media,
        fields="id,name",
    ).execute()

    file_id = created["id"]

    # Make it viewable by anyone with the link
    service.permissions().create(
        fileId=file_id,
        body={"type": "anyone", "role": "reader"},
        fields="id",
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
