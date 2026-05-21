import asyncio
import importlib
import importlib.metadata as importlib_metadata
import os
import sys
import types
from unittest.mock import AsyncMock, patch
import unittest


BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)


def _load_server():
    os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
    _install_stubs()
    return importlib.import_module("server")


def _install_stubs():
    if not hasattr(importlib_metadata, "_original_version"):
        importlib_metadata._original_version = importlib_metadata.version

        def _version(name):
            if name == "email-validator":
                return "2.0.0"
            return importlib_metadata._original_version(name)

        importlib_metadata.version = _version

    if "supabase" not in sys.modules:
        supabase = types.ModuleType("supabase")

        class _ClientOptions:
            def __init__(self, *args, **kwargs):
                pass

        class _Client:
            pass

        supabase.create_client = lambda *args, **kwargs: _Client()
        supabase.Client = _Client
        supabase.ClientOptions = _ClientOptions
        sys.modules["supabase"] = supabase

    if "resend" not in sys.modules:
        resend = types.ModuleType("resend")
        resend.api_key = ""
        resend.Emails = types.SimpleNamespace(send=lambda *args, **kwargs: None)
        sys.modules["resend"] = resend

    if "slowapi" not in sys.modules:
        slowapi = types.ModuleType("slowapi")
        class _Limiter:
            def __init__(self, *args, **kwargs):
                pass
            def limit(self, *args, **kwargs):
                def decorator(fn):
                    return fn
                return decorator
        slowapi.Limiter = _Limiter
        slowapi._rate_limit_exceeded_handler = lambda *args, **kwargs: None
        sys.modules["slowapi"] = slowapi

        util = types.ModuleType("slowapi.util")
        util.get_remote_address = lambda request: "127.0.0.1"
        sys.modules["slowapi.util"] = util

        errors = types.ModuleType("slowapi.errors")

        class RateLimitExceeded(Exception):
            pass

        errors.RateLimitExceeded = RateLimitExceeded
        sys.modules["slowapi.errors"] = errors

    if "apscheduler" not in sys.modules:
        apscheduler = types.ModuleType("apscheduler")
        sys.modules["apscheduler"] = apscheduler

        sched_asyncio = types.ModuleType("apscheduler.schedulers.asyncio")

        class AsyncIOScheduler:
            def __init__(self, *args, **kwargs):
                pass
            def start(self):
                pass

        sched_asyncio.AsyncIOScheduler = AsyncIOScheduler
        sys.modules["apscheduler.schedulers.asyncio"] = sched_asyncio

        triggers_cron = types.ModuleType("apscheduler.triggers.cron")

        class CronTrigger:
            def __init__(self, *args, **kwargs):
                pass

        triggers_cron.CronTrigger = CronTrigger
        sys.modules["apscheduler.triggers.cron"] = triggers_cron

    if "bcrypt" not in sys.modules:
        bcrypt = types.ModuleType("bcrypt")
        bcrypt.gensalt = lambda *args, **kwargs: b"salt"
        bcrypt.hashpw = lambda password, salt: b"hashed-password"
        bcrypt.checkpw = lambda plain, hashed: True
        sys.modules["bcrypt"] = bcrypt

    if "email_validator" not in sys.modules:
        email_validator = types.ModuleType("email_validator")

        class EmailNotValidError(ValueError):
            pass

        def validate_email(email, *args, **kwargs):
            return types.SimpleNamespace(email=email, normalized=email)

        email_validator.EmailNotValidError = EmailNotValidError
        email_validator.validate_email = validate_email
        sys.modules["email_validator"] = email_validator


class MaskedResumeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = _load_server()

    def _patch_common(self, metadata, raw_bytes):
        server = self.server

        async def fake_current_user(_request):
            return {"role": "admin"}

        async def fake_run(fn):
            return fn()

        return [
            patch.object(server, "get_current_user", side_effect=fake_current_user),
            patch.object(server, "_require_module", return_value=None),
            patch.object(server, "safe_single", new=AsyncMock(return_value={
                "id": "cand-1",
                "full_name": "Test Candidate",
                "resume_url": "https://drive.google.com/file/d/abc123/view",
            })),
            patch.object(server, "run", side_effect=fake_run),
            patch.object(server, "download_resume", return_value=raw_bytes),
            patch.object(server, "get_file_metadata", return_value=metadata),
        ]

    def test_pdf_resume_is_returned_as_pdf(self):
        server = self.server
        patches = self._patch_common(
            {"mimeType": "application/pdf", "name": "resume.pdf"},
            b"%PDF-1.4",
        )
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], \
            patch.object(server, "_mask_pdf_bytes", return_value=b"masked-pdf") as mask_pdf, \
            patch.object(server, "_mask_docx_bytes") as mask_docx:
            response = asyncio.run(server.download_masked_resume("cand-1", object()))

        self.assertEqual(response.media_type, "application/pdf")
        self.assertIn('filename="Test_Candidate_masked.pdf"', response.headers["content-disposition"])
        self.assertEqual(response.body, b"masked-pdf")
        mask_pdf.assert_called_once_with(b"%PDF-1.4")
        mask_docx.assert_not_called()

    def test_docx_resume_is_returned_as_docx(self):
        server = self.server
        patches = self._patch_common(
            {"mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "name": "resume.docx"},
            b"docx-bytes",
        )
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], \
            patch.object(server, "_mask_pdf_bytes") as mask_pdf, \
            patch.object(server, "_mask_docx_bytes", return_value=b"masked-docx") as mask_docx:
            response = asyncio.run(server.download_masked_resume("cand-1", object()))

        self.assertEqual(response.media_type, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.assertIn('filename="Test_Candidate_masked.docx"', response.headers["content-disposition"])
        self.assertEqual(response.body, b"masked-docx")
        mask_pdf.assert_not_called()
        mask_docx.assert_called_once_with(b"docx-bytes")

    def test_legacy_doc_resume_keeps_doc_mime_type(self):
        server = self.server
        patches = self._patch_common(
            {"mimeType": "application/msword", "name": "resume.doc"},
            b"doc-bytes",
        )
        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], \
            patch.object(server, "_mask_pdf_bytes") as mask_pdf, \
            patch.object(server, "_mask_docx_bytes") as mask_docx:
            response = asyncio.run(server.download_masked_resume("cand-1", object()))

        self.assertEqual(response.media_type, "application/msword")
        self.assertIn('filename="Test_Candidate_masked.doc"', response.headers["content-disposition"])
        self.assertEqual(response.body, b"doc-bytes")
        mask_pdf.assert_not_called()
        mask_docx.assert_not_called()


if __name__ == "__main__":
    unittest.main()
