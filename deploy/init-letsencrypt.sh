#!/bin/sh
# Первый выпуск сертификата Let's Encrypt. Запускается ОДИН раз, после того
# как домен уже указывает A-записью на IP сервера.
#
#   sh deploy/init-letsencrypt.sh
#
# Дальше certbot из docker-compose.prod.yaml продлевает сертификат сам.
#
# Хитрость: nginx не стартует, если в конфиге указаны файлы сертификата,
# которых ещё нет. А certbot не может пройти проверку, пока nginx не отдаёт
# /.well-known/acme-challenge/. Разрываем круг самоподписанной заглушкой.

set -e

cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yaml"

if [ ! -f .env ]; then
    echo "Нет файла .env — скопируй .env.prod.example и заполни" >&2
    exit 1
fi

# shellcheck disable=SC1091
DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
EMAIL=$(grep -E '^LETSENCRYPT_EMAIL=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")

if [ -z "$DOMAIN" ]; then
    echo "В .env не задан DOMAIN" >&2
    exit 1
fi
if [ -z "$EMAIL" ]; then
    echo "В .env не задан LETSENCRYPT_EMAIL (на этот адрес придёт письмо," >&2
    echo "если сертификат вдруг перестанет продлеваться)" >&2
    exit 1
fi

echo "==> Домен: $DOMAIN"

CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

echo "==> Создаю временный самоподписанный сертификат, чтобы nginx смог стартовать"
$COMPOSE run --rm --entrypoint "\
    sh -c 'mkdir -p $CERT_PATH && \
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout $CERT_PATH/privkey.pem \
        -out    $CERT_PATH/fullchain.pem \
        -subj \"/CN=localhost\"'" certbot

echo "==> Поднимаю nginx с временным сертификатом"
$COMPOSE up -d --no-deps nginx

echo "==> Удаляю заглушку"
$COMPOSE run --rm --entrypoint "rm -rf /etc/letsencrypt/live/$DOMAIN /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

echo "==> Запрашиваю настоящий сертификат у Let's Encrypt"
$COMPOSE run --rm --entrypoint "\
    certbot certonly --webroot -w /var/www/certbot \
        --email $EMAIL \
        -d $DOMAIN \
        --rsa-key-size 2048 \
        --agree-tos \
        --no-eff-email \
        --non-interactive" certbot

echo "==> Перезапускаю nginx с настоящим сертификатом"
$COMPOSE exec nginx nginx -s reload

echo
echo "Готово. Проверь: https://$DOMAIN"
