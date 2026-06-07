import logging
import redis.asyncio as redis
from src.config import settings

logger = logging.getLogger(__name__)

_redis: redis.Redis | None = None


async def init_redis():
    global _redis
    logger.info(
        "Connecting to Redis: host=%s port=%s ssl=%s user=%s password=%s",
        settings.REDIS_HOST,
        settings.REDIS_PORT,
        settings.REDIS_SSL,
        settings.REDIS_USER or "(none)",
        "***" if settings.REDIS_PASSWORD else "(none)",
    )
    _redis = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        decode_responses=True,
        ssl=settings.REDIS_SSL,
        password=settings.REDIS_PASSWORD or None,
        username=settings.REDIS_USER or None,
        socket_connect_timeout=5,
        socket_timeout=5,
    )
    try:
        pong = await _redis.ping()
        logger.info("Redis ping: %s", pong)
    except Exception as e:
        logger.error("Redis ping FAILED: %s", e)


async def close_redis():
    if _redis:
        await _redis.aclose()


def get_redis() -> redis.Redis:
    if not _redis:
        raise RuntimeError("Redis not initialized")
    return _redis
