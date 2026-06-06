import redis.asyncio as redis
from src.config import settings

_redis: redis.Redis | None = None


async def init_redis():
    global _redis
    _redis = redis.Redis(
        host=settings.REDIS_HOST,
        port=settings.REDIS_PORT,
        decode_responses=True,
        ssl=settings.REDIS_SSL,
    )


async def close_redis():
    if _redis:
        await _redis.aclose()


def get_redis() -> redis.Redis:
    if not _redis:
        raise RuntimeError("Redis not initialized")
    return _redis
