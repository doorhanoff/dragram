#!/bin/sh
# Обновление продакшена: скачать свежий образ и перезапустить приложение.
# Миграции Alembic накатываются автоматически в entrypoint.sh при старте.
#
#   sh deploy/deploy.sh

set -e

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yaml"

echo "==> Скачиваю свежий образ"
$COMPOSE pull app

echo "==> Перезапускаю приложение"
$COMPOSE up -d

echo "==> Жду, пока приложение станет healthy"
i=0
while [ $i -lt 60 ]; do
    status=$($COMPOSE ps --format json app 2>/dev/null | grep -o '"Health":"[a-z]*"' | cut -d'"' -f4 || true)
    if [ "$status" = "healthy" ]; then
        echo "==> Приложение поднялось"
        break
    fi
    if [ "$status" = "unhealthy" ]; then
        echo "Приложение не стартовало. Логи:" >&2
        $COMPOSE logs --tail 50 app >&2
        exit 1
    fi
    i=$((i + 1))
    sleep 2
done

# Пересозданный контейнер получает новый IP, а nginx резолвит имя upstream
# один раз при старте и держит старый адрес — без перечитывания конфига сайт
# отдаёт 502. Проверено на практике.
echo "==> Перечитываю конфиг nginx, чтобы он увидел новый адрес приложения"
$COMPOSE exec -T nginx nginx -s reload

echo "==> Чищу старые образы"
docker image prune -f

echo
echo "Готово."
$COMPOSE ps
