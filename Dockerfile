FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backfill.py .

# Use -u flag for unbuffered output so logs appear immediately in Cloud Run
CMD ["python", "-u", "backfill.py"]
