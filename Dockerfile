# ── Шаг 1: сборка фронтенда ──────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Шаг 2: Python-бэкенд ─────────────────────────────────────────────────
FROM python:3.14-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN pip install uv

COPY pyproject.toml uv.lock* ./
RUN uv sync --no-install-project --no-dev

COPY . .
# Подкладываем собранный фронт поверх (перезаписывает frontend/dist если был)
COPY --from=frontend-builder /frontend/dist ./frontend/dist

RUN chmod +x entrypoint.sh

EXPOSE 8000

CMD ["sh", "entrypoint.sh"]
