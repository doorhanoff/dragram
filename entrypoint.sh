#!/bin/sh
uv run alembic upgrade head
uv run uvicorn main:app --host 0.0.0.0 --port 8000
