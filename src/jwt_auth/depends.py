from .jwt_service import JWTManager
from src.redis.depends import get_redis_client
from src.config import settings
import redis.asyncio as redis
from fastapi import Depends


async def get_jwt_manager(redis_client: redis.Redis = Depends(get_redis_client)) -> JWTManager:
    return JWTManager(redis_client, secret_or_private_key=settings.JWT_SECRET_KEY)
