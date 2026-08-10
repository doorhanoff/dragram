from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    # Database
    DB_HOST: str
    DB_PORT: int
    DB_USER: str
    DB_PASS: str
    DB_NAME: str

    # Redis
    REDIS_URL: str = ""
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_SSL: bool = False
    REDIS_PASSWORD: str = ""
    REDIS_USER: str = ""

    # JWT
    JWT_SECRET_KEY:  str
    JWT_ACCESS_TTL:  int = 900     # 15 минут
    JWT_REFRESH_TTL: int = 604_800 # 7 дней

    # s3
    S3_ENDPOINT: str = "https://storage.yandexcloud.net"
    S3_REGION: str = "ru-central1"
    S3_BUCKET: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    # Бэкапы базы лежат в ОТДЕЛЬНОМ приватном бакете — в бакет с медиа их класть
    # нельзя: он раздаётся клиентам, и дамп с хешами паролей и key_backup
    # оказался бы скачиваемым по прямой ссылке.
    S3_BACKUP_BUCKET: str = ""
    # Сколько живёт presigned-ссылка на медиафайл. Достаточно, чтобы открыть
    # картинку или досмотреть видео, и мало, чтобы ссылка что-то значила,
    # утекнув в лог или в чужую историю браузера.
    MEDIA_LINK_TTL: int = 900
    # Суточная квота на загрузки одного пользователя (байт). Без неё один
    # аккаунт забивает диск VPS и счёт за Object Storage за несколько минут.
    UPLOAD_DAILY_QUOTA: int = 1024 * 1024 * 1024

    # Пул соединений с БД. Потолок одновременно открытых коннектов на один
    # процесс приложения — DB_POOL_SIZE + DB_MAX_OVERFLOW; при нескольких
    # воркерах uvicorn это число умножается, а у провайдера (Supabase и т.п.)
    # есть свой лимит — не задирайте вслепую.
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    # Сколько ждать свободный коннект, прежде чем упасть с QueuePool timeout.
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800

    # SSL для облачных БД (Supabase требует)
    DB_SSL: bool = True
    # Проверка сертификата сервера БД. По умолчанию выключена (соединение
    # шифруется, но сервер не аутентифицируется — защита от прослушивания,
    # не от MITM). Включайте, когда у провайдера сертификат из системного CA
    # или его CA добавлен в доверенные.
    DB_SSL_VERIFY: bool = False

    # Firebase Cloud Messaging (push-уведомления)
    FCM_CREDENTIALS_JSON: str = ""

    # ── Дверь перед сайтом ────────────────────────────────────────────────
    # Прежде чем показать вход, сайт спрашивает два ответа. Хранятся только
    # Argon2-хеши: из .env, из образа и из репозитория сами ответы получить
    # нельзя. Пусты — дверь выключена (иначе опечатка в конфиге закрыла бы
    # сайт вообще для всех, включая владельца).
    GATE_BIRTHDAY_HASH: str = ""
    GATE_CREATOR_HASH: str = ""
    # Сколько дней помнить пройденную дверь, чтобы не спрашивать каждый раз.
    GATE_TTL_DAYS: int = 30

    # Боевой домен. Пусто при локальной разработке; на сервере задаётся в .env
    # и попадает в список разрешённых CORS-origin'ов.
    DOMAIN: str = ""
    # Режим разработки: включает /docs, /redoc и /openapi.json и разрешает
    # CORS с localhost и из локальной сети. На сервере всегда false.
    DEBUG: bool = False
    # Дополнительные origin'ы через запятую — на случай, если фронтенд
    # обслуживается с другого адреса, чем DOMAIN.
    CORS_ORIGINS: str = ""

    # Сколько доверенных прокси стоит перед приложением: балансировщик
    # Render/Railway = 1, локально nginx из docker-compose = 1.
    # Используется при разборе X-Forwarded-For — см. _client_ip в
    # core/rate_limit.py. Если впереди появится ещё один слой (Cloudflare),
    # значение надо увеличить, иначе лимитер увидит IP прокси вместо клиента.
    TRUSTED_PROXY_COUNT: int = 1

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    @property
    def is_production(self) -> bool:
        return bool(self.DOMAIN) and not self.DEBUG

    @property
    def gate_enabled(self) -> bool:
        return bool(self.GATE_BIRTHDAY_HASH and self.GATE_CREATOR_HASH)

    @property
    def cors_origins(self) -> list[str]:
        """Мобильное приложение, боевой домен и — только в разработке — localhost."""
        # Origin'ы WebView в Capacitor: приложение обращается к API кросс-доменно
        # и в проде тоже, поэтому они нужны всегда.
        origins = [
            "capacitor://localhost",
            "https://localhost",
        ]
        if not self.is_production:
            origins += [
                "http://localhost:5173",
                "http://localhost:3000",
                "http://localhost",
            ]
        if self.DOMAIN:
            origins.append(f"https://{self.DOMAIN}")
        origins.extend(o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip())
        return origins

    @property
    def cors_origin_regex(self) -> str | None:
        """Любое устройство домашней сети — это удобно при отладке телефона,
        но вместе с allow_credentials=True в проде это дыра: сайт из локальной
        сети смог бы делать авторизованные запросы. Только для разработки."""
        if self.is_production:
            return None
        return r"http://192\.168\.\d+\.\d+(:\d+)?"

    @property
    def asyncpg_database_url(self) -> str:
        ssl = "&ssl=require" if self.DB_SSL else ""
        return (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASS}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            f"?prepared_statement_cache_size=0{ssl}"
        )
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

ALLOWED_MEDIA_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
    "audio/mpeg", "audio/ogg", "audio/webm", "audio/mp4", "audio/wav",
}

# Документы — только для сообщений в чате. В альбомы и посты они не годятся:
# альбом это фотографии, и файл в сетке нечем показать.
#
# Список закрытый и намеренно без исполняемого: apk, exe и скрипты пересылать
# через семейный мессенджер незачем, а вот прислать «фотографию» с таким
# содержимым — обычный способ обмануть получателя.
ALLOWED_DOC_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/rtf",
    "application/zip",
    "text/plain",
    "text/csv",
}

# Что вообще можно приложить к сообщению.
ALLOWED_CHAT_ATTACHMENTS = ALLOWED_MEDIA_TYPES | ALLOWED_DOC_TYPES

# Общий потолок размера одного загружаемого файла (аватары, посты, альбомы).
# Для сообщений чата действуют свои лимиты по типу — см. chats/service.py.
MAX_FILE_SIZE = 25 * 1024 * 1024


settings = Settings()
