#!/bin/sh
# Ежедневный бэкап базы: локальная копия + выгрузка в Yandex Object Storage.
#
# Смысл выгрузки наружу: база теперь живёт на том же сервере, что и приложение,
# поэтому локальная копия не спасёт от потери самого сервера. Object Storage
# лежит отдельно и уже оплачен.
#
# Ставится в cron скриптом install-backup-cron.sh (лежит рядом), вручную
# запускается так:
#   sh /opt/dragram/deploy/backup-db.sh

set -e

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yaml"
DIR=/var/backups/dragram
KEEP_LOCAL_DAYS=7
KEEP_REMOTE_DAYS=30

mkdir -p "$DIR"

DB_USER=$(grep '^DB_USER=' .env | cut -d= -f2- | tr -d '\r')
DB_NAME=$(grep '^DB_NAME=' .env | cut -d= -f2- | tr -d '\r')

STAMP=$(date -u +%Y%m%d-%H%M%S)
FILE="$DIR/dragram-$STAMP.sql.gz"

echo "==> Снимаю дамп базы $DB_NAME"
$COMPOSE exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip -9 > "$FILE"

SIZE=$(stat -c %s "$FILE")
if [ "$SIZE" -lt 500 ]; then
    echo "Дамп подозрительно мал ($SIZE байт) — что-то пошло не так" >&2
    rm -f "$FILE"
    exit 1
fi
echo "    готово: $FILE ($SIZE байт)"

echo "==> Выгружаю в Object Storage"
# boto3 и ключи S3 уже есть внутри контейнера приложения — ничего
# дополнительно на сервер ставить не нужно.
#
# Бэкапы уходят в ОТДЕЛЬНЫЙ приватный бакет (S3_BACKUP_BUCKET). Раньше они
# лежали рядом с медиа, в том самом бакете, который сайт раздавал наружу
# через /media/ — то есть дамп со всеми хешами паролей, телефонами и
# зашифрованными приватными ключами скачивался по прямой ссылке.
$COMPOSE exec -T app uv run python -c '
import os, sys, datetime
import boto3

key = "backups/" + sys.argv[1]
keep_days = int(sys.argv[2])

bucket = os.environ.get("S3_BACKUP_BUCKET", "")
if not bucket:
    sys.exit("S3_BACKUP_BUCKET не задан. Бэкапы нельзя класть в бакет с медиа: "
             "он раздаётся клиентам. Заведите отдельный приватный бакет.")
if bucket == os.environ.get("S3_BUCKET"):
    sys.exit("S3_BACKUP_BUCKET совпадает с S3_BUCKET — нужен отдельный бакет.")

s3 = boto3.client(
    "s3",
    endpoint_url=os.environ["S3_ENDPOINT"],
    region_name=os.environ.get("S3_REGION", "ru-central1"),
    aws_access_key_id=os.environ.get("S3_BACKUP_ACCESS_KEY") or os.environ["S3_ACCESS_KEY"],
    aws_secret_access_key=os.environ.get("S3_BACKUP_SECRET_KEY") or os.environ["S3_SECRET_KEY"],
)

s3.upload_fileobj(sys.stdin.buffer, bucket, key)
print("    загружено:", key)

# Чистка старых копий в хранилище
cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=keep_days)
removed = 0
paginator = s3.get_paginator("list_objects_v2")
for page in paginator.paginate(Bucket=bucket, Prefix="backups/"):
    for obj in page.get("Contents", []):
        if obj["LastModified"] < cutoff:
            s3.delete_object(Bucket=bucket, Key=obj["Key"])
            removed += 1
if removed:
    print(f"    удалено старых копий в хранилище: {removed}")
' "$(basename "$FILE")" "$KEEP_REMOTE_DAYS" < "$FILE"

echo "==> Чищу локальные копии старше $KEEP_LOCAL_DAYS дней"
find "$DIR" -name 'dragram-*.sql.gz' -mtime +$KEEP_LOCAL_DAYS -delete

echo "Готово. Локальные копии:"
ls -lh "$DIR" | tail -5
