#!/bin/sh
# Первичная настройка чистого сервера (Ubuntu 24.04). Запускается один раз
# от root сразу после покупки VPS:
#
#   sh deploy/bootstrap-server.sh
#
# Ставит Docker, включает файрвол, добавляет swap и автообновления
# безопасности. Само приложение не разворачивает — это делает DEPLOY.md.

set -e

if [ "$(id -u)" != "0" ]; then
    echo "Запускай от root: sudo sh deploy/bootstrap-server.sh" >&2
    exit 1
fi

echo "==> Обновляю систему"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y

echo "==> Ставлю Docker"
if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Добавляю swap 2 ГБ"
# Страховка от OOM: приложению 2 ГБ RAM хватает, но при пиковой нагрузке
# или ручной пересборке образа памяти может не хватить.
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    # Пользуемся swap только когда память реально кончается
    sysctl -w vm.swappiness=10
    echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
fi

echo "==> Настраиваю файрвол"
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Включаю автообновления безопасности"
apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo
echo "Готово. Дальше — по инструкции в DEPLOY.md, раздел «Разворачиваем проект»."
docker --version
free -h
