# Built with voice/ as the build context (Railway root directory = voice).
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=3095
EXPOSE 3095
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT}"]
