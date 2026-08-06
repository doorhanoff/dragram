#!/bin/sh
uv run alembic upgrade head || exit 1
# --proxy-headers: за nginx приложение должно узнавать настоящую схему и IP
# клиента из X-Forwarded-*.
#
# FORWARDED_ALLOW_IPS — кому из отправителей этих заголовков верить. В проде
# задаётся подсетью Docker (см. docker-compose.prod.yaml): порт 8000 наружу не
# публикуется, но с явной подсетью ошибка в compose не превращается сразу в
# дыру — подделать IP клиента (и обойти лимитер) смог бы кто угодно.
uv run uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" \
    --proxy-headers --forwarded-allow-ips="${FORWARDED_ALLOW_IPS:-*}"
