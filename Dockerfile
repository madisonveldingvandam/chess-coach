# syntax=docker/dockerfile:1

FROM node:22-slim AS frontend

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    CHESS_COACH_DATA_DIR=/tmp/chess-coach-data \
    PORT=10000

WORKDIR /app

COPY pyproject.toml README.md ./
COPY chess_coach ./chess_coach
RUN pip install --no-cache-dir .

COPY --from=frontend /app/frontend/dist ./frontend/dist
RUN mkdir -p /tmp/chess-coach-data

EXPOSE 10000
CMD ["sh", "-c", "python -m uvicorn chess_coach.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
