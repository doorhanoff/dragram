#!/bin/sh
uv run alembic upgrade head || exit 1
# --proxy-headers: за nginx приложение должно узнавать настоящую схему и IP
# клиента из X-Forwarded-*. Доверять можно всем адресам, потому что порт 8000
# наружу не публикуется — достучаться до него может только nginx.
uv run uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" \
    --proxy-headers --forwarded-allow-ips="*"
