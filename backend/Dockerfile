FROM python:3.11-slim

# HF Spaces runs as non-root user, port 7860
ENV PORT=7860
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY server.py .
COPY google_drive.py .
COPY llm_utils.py .

# Hugging Face Spaces expects the app on port 7860
EXPOSE 7860

# ── Production startup ─────────────────────────────────────────────────────
# Single worker: APScheduler fires on @app.on_event("startup").
# Two workers = two scheduler processes = duplicate digest emails + double cron.
# Async FastAPI handles 100–500 concurrent users fine on a single event loop.
#
# --limit-concurrency 200   hard cap before uvicorn returns 503 (prevents OOM)
# --timeout-keep-alive 5    drops idle HTTP/1.1 keep-alive connections quickly (default 5 s)
# --log-level info          structured request logs visible in HF Spaces → Logs tab
#
# HuggingFace sleep note:
#   CPU Basic sleeps after 48 h of inactivity.  Add the /health endpoint URL to
#   UptimeRobot (free) at a 5-minute interval to keep the Space warm 24/7.
#   Health URL: https://<your-space>.hf.space/health
CMD ["uvicorn", "server:app", \
     "--host", "0.0.0.0", \
     "--port", "7860", \
     "--limit-concurrency", "200", \
     "--timeout-keep-alive", "5", \
     "--log-level", "info"]
