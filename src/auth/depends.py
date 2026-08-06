from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends, Request, HTTPException, WebSocket, WebSocketException, status
from src.db.database import async_session, get_async_session
from src.jwt_auth.depends import get_jwt_manager
from src.jwt_auth.jwt_service import JWTManager, JWTError, TokenExpiredError, TokenInvalidError, TokenRevokedError
from .repo import AuthRepository
from .service import AuthService
from .schemas import TokenData
from .models import UsersOrm
from ..redis.depends import get_redis_client


async def get_auth_repo(session: AsyncSession = Depends(get_async_session)) -> AuthRepository:
    return AuthRepository(session)


async def get_auth_service(
    repo: AuthRepository = Depends(get_auth_repo),
    jwt_manager: JWTManager = Depends(get_jwt_manager),
    redis: Redis = Depends(get_redis_client)
) -> AuthService:
    return AuthService(repo, jwt_manager, redis)


async def get_token_payload(
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> TokenData:
    token = extract_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        return await service.get_token_payload(token)
    except TokenExpiredError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except TokenRevokedError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
    except (TokenInvalidError, JWTError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)


async def get_optional_token_payload(
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> TokenData | None:
    """Опциональная аутентификация: для эндпоинтов, доступных и без входа,
    но персонализирующих ответ для вошедших. Любая проблема с токеном —
    просто аноним, без 401."""
    token = extract_token(request)
    if not token:
        return None
    try:
        return await service.get_token_payload(token)
    except Exception:
        return None


def extract_token(request: Request) -> str | None:
    """Принимает токен из куки (веб) или Authorization: Bearer (мобильное)."""
    token = request.cookies.get("token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    return token or None


async def get_current_user(
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> UsersOrm:
    token = extract_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        user = await service.get_user_data_by_token(token)
    except TokenExpiredError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except TokenRevokedError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
    except (TokenInvalidError, JWTError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


async def ws_get_current_user(
    websocket: WebSocket,
    jwt_manager: JWTManager = Depends(get_jwt_manager),
    redis: Redis = Depends(get_redis_client),
) -> UsersOrm:
    """Аутентификация websocket-соединения.

    Сессию БД открываем прямо здесь и сразу закрываем, а не берём через
    Depends(get_auth_service): зависимость с yield живёт столько же, сколько
    само соединение, и коннект из пула был бы занят всё время, пока открыт чат.
    Пользователь загружается вместе с чатами и участниками (selectinload), так
    что после закрытия сессии объект остаётся пригодным для чтения.

    Токен в query-строку больше не принимаем: браузерный WebSocket не умеет
    задавать Authorization, а `?token=<JWT>` оседает в access-логах nginx и
    любого прокси по пути. Вместо него — одноразовый тикет (`POST
    /chats/ws-ticket`), который гасится при первом же использовании.
    """
    try:
        async with async_session() as session:
            service = AuthService(AuthRepository(session), jwt_manager, redis)
            user = await service.authenticate_websocket(
                token=websocket.cookies.get("token"),
                ticket=websocket.query_params.get("ticket"),
            )
        if not user:
            raise WebSocketException(code=4001, reason="User not found")
        return user
    except WebSocketException:
        raise
    except Exception:
        raise WebSocketException(code=4001, reason="Auth error")
