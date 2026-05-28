import redis.asyncio as redis
from .redis_service import get_redis


async def get_redis_client() -> redis.Redis:
    return get_redis()
