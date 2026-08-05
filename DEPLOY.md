# Развёртывание Dragram на VPS

Инструкция для переноса проекта на свой сервер. Postgres остаётся в Supabase,
файлы — в Yandex Object Storage, на сервере живут только приложение, Redis и nginx.

**Бюджет:** ~880 ₽/мес за VPS + ~30 ₽/мес за домен. Supabase и Let's Encrypt бесплатны.

---

## Что откуда берётся

```
                  интернет
                     │  :443 HTTPS
              ┌──────▼──────┐
              │    nginx    │◄── сертификат от certbot (обновляется сам)
              └──┬───────┬──┘
     /media/     │       │  всё остальное + WebSocket
   ┌─────────────▼─┐  ┌──▼──────────┐
   │ Yandex Object │  │     app     │  FastAPI + собранный фронтенд
   │    Storage    │  │  (uvicorn)  │
   └───────────────┘  └──┬───────┬──┘
                         │       │
                  ┌──────▼──┐  ┌─▼──────────────┐
                  │  redis  │  │ Supabase       │
                  │ pub/sub │  │ Postgres       │
                  └─────────┘  └────────────────┘
```

Образ приложения собирается **на GitHub Actions**, а не на сервере: сборка
фронтенда через Vite требует ~1.5 ГБ RAM и на VPS с 2 ГБ упала бы с OOM.
Сервер только скачивает готовый образ.

---

## Шаг 1. Покупка сервера

Заказать VPS (например, [Timeweb Cloud](https://timeweb.cloud/)) с параметрами:

| Параметр | Значение |
|---|---|
| ОС | Ubuntu 24.04 |
| CPU / RAM | 2 vCPU / 2 ГБ |
| Диск | 40 ГБ NVMe |
| Локация | Москва или Санкт-Петербург |

При заказе загрузить свой SSH-ключ (не пароль — так безопаснее и удобнее).
Если ключа нет, создать: `ssh-keygen -t ed25519`.

## Шаг 2. Домен

Купить домен и в панели DNS создать **A-запись**, указывающую на IP сервера:

```
Тип: A    Имя: @    Значение: <IP сервера>    TTL: 300
```

Обновление DNS занимает от нескольких минут до пары часов. Проверить:

```bash
nslookup dragram.ru
```

Дальше идти только когда `nslookup` показывает IP сервера — иначе Let's Encrypt
не выдаст сертификат.

## Шаг 3. Настройка сервера

```bash
ssh root@<IP сервера>
```

На сервере:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/doorhanoff/dragram.git /opt/dragram
cd /opt/dragram
sh deploy/bootstrap-server.sh
```

Скрипт ставит Docker, включает файрвол (открыты только 22, 80, 443), добавляет
2 ГБ swap и включает автообновления безопасности.

## Шаг 4. Переменные окружения

```bash
cd /opt/dragram
cp .env.prod.example .env
nano .env
```

Заполнить все поля.

> **Про знак `$` в значениях.** Docker Compose раскрывает `$` в `.env` как
> подстановку переменной: пароль `abc$Odk123` молча превратится в `abc`, и
> приложение не подключится к базе с невнятной ошибкой авторизации. У текущего
> пароля от Supabase такой символ есть. Лечится удвоением: `abc$$Odk123`.
> Проверить, что всё прочиталось правильно:
>
> ```bash
> docker compose -f docker-compose.prod.yaml config | grep DB_PASS
> ```
>
> (в выводе `$` тоже показывается удвоенным — это нормально, внутрь контейнера
> попадёт один).

Отдельно про два поля:

- **`JWT_SECRET_KEY`** — сгенерировать новый, локальный не переносить:
  ```bash
  python3 -c "import secrets; print(secrets.token_urlsafe(64))"
  ```
  После смены ключа все выданные раньше токены станут недействительными —
  пользователям придётся войти заново.
- **`FCM_CREDENTIALS_JSON`** — содержимое service-account JSON одной строкой,
  без переносов.

Закрыть файл от посторонних глаз:

```bash
chmod 600 .env
```

## Шаг 5. Доступ к образу

GitHub Actions собирает образ при каждом push в `master` и кладёт в GitHub
Container Registry. Первая сборка запустится сама после того, как эти файлы
попадут в репозиторий; посмотреть её можно во вкладке **Actions**.

Если репозиторий **приватный**, образ тоже приватный, и серверу нужен доступ:

1. GitHub → Settings → Developer settings → Personal access tokens →
   Tokens (classic) → Generate new token, галочка **`read:packages`**;
2. на сервере:
   ```bash
   echo "<токен>" | docker login ghcr.io -u doorhanoff --password-stdin
   ```

Если репозиторий публичный — шаг можно пропустить, но образ по умолчанию всё
равно приватный: сделать его публичным можно в GitHub → Packages → dragram →
Package settings → Change visibility.

## Шаг 6. Сертификат и запуск

```bash
cd /opt/dragram
sh deploy/init-letsencrypt.sh
```

Скрипт выпустит сертификат Let's Encrypt и поднимет nginx. Затем:

```bash
sh deploy/deploy.sh
```

Готово — проект доступен по `https://<твой домен>`.

---

## Обновление после изменений в коде

```bash
git push            # локально
```

GitHub Actions соберёт новый образ (~3–5 минут), после чего на сервере:

```bash
cd /opt/dragram && git pull && sh deploy/deploy.sh
```

Миграции Alembic накатываются автоматически при старте контейнера
(см. `entrypoint.sh`).

## Полезные команды

```bash
docker compose -f docker-compose.prod.yaml ps
```

```bash
docker compose -f docker-compose.prod.yaml logs -f app
```

```bash
docker compose -f docker-compose.prod.yaml restart app
```

## Мобильное приложение

В `frontend/.env.local` заменить адрес Render на свой домен и пересобрать APK:

```
VITE_API_URL=https://dragram.ru
VITE_WS_URL=wss://dragram.ru
```

```bash
npm run cap:android
```

Веб-версии это не касается: в Docker-образе `.env.local` удаляется, и фронтенд
ходит по относительным путям на тот же домен.

## Если что-то пошло не так

| Симптом | Причина и что делать |
|---|---|
| `init-letsencrypt.sh` падает на запросе сертификата | DNS ещё не обновился либо A-запись указывает не туда. Проверить `nslookup`, подождать, запустить скрипт снова |
| Приложение unhealthy, в логах ошибка подключения к БД | Неверные данные Supabase в `.env`, не задан `DB_SSL=true` — или в пароле неэкранированный `$`, см. шаг 4 |
| WebSocket отваливается через минуту | Между клиентом и сервером появился ещё один прокси (например, Cloudflare) — увеличить `TRUSTED_PROXY_COUNT` и проверить его таймауты |
| `docker compose pull` — permission denied | Сервер не авторизован в ghcr.io, см. шаг 5 |
| Ошибка вида `exec /app/entrypoint.sh: no such file or directory` | В git попали CRLF-переносы. Исправляется `.gitattributes`, при необходимости: `git add --renormalize . && git commit` |

## Бэкапы

Postgres бэкапит Supabase, файлы лежат в Object Storage — оба переживут потерю
сервера. На самом сервере ценного мало, но `.env` стоит сохранить в надёжном
месте: восстановить его содержимое неоткуда.
