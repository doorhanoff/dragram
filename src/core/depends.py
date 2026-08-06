from fastapi import Depends
from redis.asyncio import Redis

from src.redis.depends import get_redis_client
from .quota import UploadQuota


async def get_upload_quota(redis: Redis = Depends(get_redis_client)) -> UploadQuota:
    return UploadQuota(redis)
