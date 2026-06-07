from pathlib import Path
from urllib.parse import urlparse, unquote

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


def _parse_database_url(url: str) -> dict:
    """Parse a PostgreSQL connection URL into individual components."""
    parsed = urlparse(url)
    # Enable SSL when the URL explicitly requests it, or when connecting to a
    # remote host (anything that is not localhost / the compose service name).
    ssl = (
        "sslmode=require" in url
        or "sslmode=verify" in url
        or (
            "sslmode" not in url
            and parsed.hostname not in ("localhost", "127.0.0.1", "db")
        )
    )
    return {
        "host": parsed.hostname or "localhost",
        "port": parsed.port or 5432,
        "user": unquote(parsed.username or "postgres"),
        "password": unquote(parsed.password or ""),
        "database": parsed.path.lstrip("/"),
        "ssl": ssl,
    }


def _parse_redis_url(url: str) -> dict:
    """Parse a Redis connection URL into individual components."""
    parsed = urlparse(url)
    return {
        "host": parsed.hostname or "localhost",
        "port": parsed.port or 6379,
        "password": unquote(parsed.password) if parsed.password else None,
        "ssl": parsed.scheme in ("rediss", "redis+ssl"),
    }


class Settings(BaseSettings):
    # Connection URLs (primary configuration)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/myproject"
    REDIS_URL: str = "redis://localhost:6379"

    # JWT
    JWT_SECRET_KEY: str
    JWT_ACCESS_TTL: int = 900      # 15 minutes
    JWT_REFRESH_TTL: int = 604_800  # 7 days

    # Admin seed
    ADMIN_EMAIL: str = "admin@admin.com"
    ADMIN_PASSWORD: str = "admin1234"

    # S3
    S3_ENDPOINT: str = "https://storage.yandexcloud.net"
    S3_REGION: str = "ru-central1"
    S3_BUCKET: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    # ------------------------------------------------------------------
    # Parsed database fields
    # ------------------------------------------------------------------

    @property
    def _db(self) -> dict:
        return _parse_database_url(self.DATABASE_URL)

    @property
    def DB_HOST(self) -> str:
        return self._db["host"]

    @property
    def DB_PORT(self) -> int:
        return self._db["port"]

    @property
    def DB_USER(self) -> str:
        return self._db["user"]

    @property
    def DB_PASS(self) -> str:
        return self._db["password"]

    @property
    def DB_NAME(self) -> str:
        return self._db["database"]

    @property
    def DB_SSL(self) -> bool:
        return self._db["ssl"]

    # ------------------------------------------------------------------
    # Parsed Redis fields
    # ------------------------------------------------------------------

    @property
    def _redis(self) -> dict:
        return _parse_redis_url(self.REDIS_URL)

    @property
    def REDIS_HOST(self) -> str:
        return self._redis["host"]

    @property
    def REDIS_PORT(self) -> int:
        return self._redis["port"]

    @property
    def REDIS_PASSWORD(self) -> str | None:
        return self._redis["password"]

    @property
    def REDIS_SSL(self) -> bool:
        return self._redis["ssl"]

    # ------------------------------------------------------------------
    # Computed URLs
    # ------------------------------------------------------------------

    @property
    def asyncpg_database_url(self) -> str:
        """
        Always returns a postgresql+asyncpg:// URL with the cache-busting
        query param, regardless of the scheme used in DATABASE_URL.
        """
        url = self.DATABASE_URL
        # Normalise scheme so asyncpg driver is always used
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

        # Append prepared_statement_cache_size if not already present
        separator = "&" if "?" in url else "?"
        if "prepared_statement_cache_size" not in url:
            url = f"{url}{separator}prepared_statement_cache_size=0"
        return url


settings = Settings()
