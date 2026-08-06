import uuid

from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis

from src.auth.depends import extract_token
from src.jwt_auth.depends import get_jwt_manager
from src.jwt_auth.jwt_service import JWTManager
from src.redis.depends import get_redis_client
from src.s3.depends import get_s3_service
from src.s3.service import S3Service
from .service import MediaService


async def get_media_service(
    s3: S3Service = Depends(get_s3_service),
    redis: Redis = Depends(get_redis_client),
) -> MediaService:
    return MediaService(s3, redis)


async def _user_from_token(request: Request, jwt_manager: JWTManager) -> uuid.UUID | None:
    """Только проверка подписи токена, без похода в БД: на одну открытую ленту
    приходится десяток запросов за картинками, и открывать под каждый
    соединение с базой не за что."""
    token = extract_token(request)
    if not token:
        return None
    try:
        payload = await jwt_manager.verify_token(token)
        return uuid.UUID(payload.sub)
    except Exception:
        return None


async def get_media_viewer(
    request: Request,
    jwt_manager: JWTManager = Depends(get_jwt_manager),
    service: MediaService = Depends(get_media_service),
) -> uuid.UUID:
    """Пускает вошедшего пользователя — по токену или по медиа-тикету."""
    user_id = await _user_from_token(request, jwt_manager)
    if user_id:
        return user_id
    user_id = await service.user_by_ticket(request.query_params.get("t"))
    if user_id:
        return user_id
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")


async def get_ticket_requester(
    request: Request,
    jwt_manager: JWTManager = Depends(get_jwt_manager),
) -> uuid.UUID:
    """Тикет выдаётся только по настоящему токену — тикетом тикет не продлить."""
    user_id = await _user_from_token(request, jwt_manager)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user_id
