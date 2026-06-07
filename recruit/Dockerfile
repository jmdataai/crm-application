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

# Copy source (shared files are copied here by GitHub Actions before docker build)
COPY server.py .
COPY google_drive.py .
COPY llm_utils.py .

EXPOSE 7860

# ── Production startup ─────────────────────────────────────────────────────
# NO APScheduler in this Space — no duplicate-scheduler risk.
# This Space CAN be scaled to multiple workers in future if needed.
#
# --limit-concurrency 200  hard cap before 503 (prevents OOM)
# --timeout-keep-alive 5   drops idle keep-alive connections quickly
# --log-level info         request logs visible in HF Spaces → Logs tab
#
# UptimeRobot pings /health every 5 min to keep Space warm.
CMD ["uvicorn", "server:app", \
     "--host", "0.0.0.0", \
     "--port", "7860", \
     "--limit-concurrency", "200", \
     "--timeout-keep-alive", "5", \
     "--log-level", "info"]
