#!/bin/sh
# Ставит ежедневный бэкап базы в cron. Запускать на сервере один раз:
#   sh /opt/dragram/deploy/install-backup-cron.sh
#
# Скрипт backup-db.sh ссылался на этот файл, но его в репозитории не было —
# то есть бэкапы, скорее всего, никогда не запускались по расписанию.
# Проверить после установки: crontab -l

set -e

DIR=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$DIR/backup-db.sh"
LOG=/var/log/dragram-backup.log

if [ ! -f "$SCRIPT" ]; then
    echo "Не нашёл $SCRIPT" >&2
    exit 1
fi

# 03:20 по времени сервера. Не ровно в 03:00: в этот час просыпается половина
# всех cron-задач на свете, включая обновление сертификатов.
LINE="20 3 * * * sh $SCRIPT >> $LOG 2>&1"

if crontab -l 2>/dev/null | grep -Fq "$SCRIPT"; then
    echo "Задание уже стоит в cron:"
    crontab -l | grep -F "$SCRIPT"
    exit 0
fi

# `crontab -l` возвращает ненулевой код, когда таблицы ещё нет — || true.
{ crontab -l 2>/dev/null || true; echo "$LINE"; } | crontab -

echo "Готово. Текущий crontab:"
crontab -l
echo
echo "Проверьте, что бэкап реально работает:  sh $SCRIPT"
echo "Лог: $LOG"
