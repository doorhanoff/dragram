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
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_SSL: bool = False
    REDIS_PASSWORD: str = ""
    REDIS_USER: str = ""

    # JWT
    JWT_SECRET_KEY:  str
    JWT_ACCESS_TTL:  int = 900     # 15 минут
    JWT_REFRESH_TTL: int = 604_800 # 7 дней

    # Admin seed
    ADMIN_EMAIL: str = "admin@admin.com"
    ADMIN_PASSWORD: str = "admin1234"

    # s3
    S3_ENDPOINT: str = "https://storage.yandexcloud.net"
    S3_REGION: str = "ru-central1"
    S3_BUCKET: str = ""
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""

    # SSL для облачных БД (Supabase требует)
    DB_SSL: bool = False

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", extra="ignore")

    @property
    def asyncpg_database_url(self) -> str:
        ssl = "&ssl=require" if self.DB_SSL else ""
        return (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASS}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            f"?prepared_statement_cache_size=0{ssl}"
        )


settings = Settings()
