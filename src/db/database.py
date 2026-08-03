import os
import ssl
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from src.config import settings


class Base(DeclarativeBase):
    pass


connect_args: dict = {"server_settings": {"search_path": "public"}}
if settings.DB_SSL:
    ssl_ctx = ssl.create_default_context()
    if not settings.DB_SSL_VERIFY:
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
    connect_args["ssl"] = ssl_ctx

async_engine = create_async_engine(
    url=settings.asyncpg_database_url,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_recycle=settings.DB_POOL_RECYCLE,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    connect_args=connect_args,
)

async_session = async_sessionmaker(async_engine, expire_on_commit=False)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Сессия на один HTTP-запрос.

    ВАЖНО: для websocket эту зависимость использовать нельзя. Зависимость с
    yield закрывается только когда закрывается соединение, то есть коннект из
    пула был бы занят всё время, пока у пользователя открыт чат. Для ws
    открывайте сессию на одну операцию — см. ChatsServiceFactory
    в src/chats/depends.py.
    """
    async with async_session() as session:
        yield session

