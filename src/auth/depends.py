from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends, Request, HTTPException, WebSocket, WebSocketException, status
from src.db.database import get_async_session
from src.jwt_auth.depends import get_jwt_manager
from src.jwt_auth.jwt_service import JWTManager, JWTError, TokenExpiredError, TokenInvalidError, TokenRevokedError
from .repo import AuthRepository
from .service import AuthService
from .schemas import TokenData
from .models import UsersOrm


async def get_auth_repo(session: AsyncSession = Depends(get_async_session)) -> AuthRepository:
    return AuthRepository(session)


async def get_auth_service(
    repo: AuthRepository = Depends(get_auth_repo),
    jwt_manager: JWTManager = Depends(get_jwt_manager),
) -> AuthService:
    return AuthService(repo, jwt_manager)


async def get_token_payload(
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> TokenData:
    token = request.cookies.get("token")
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


async def get_user_data(
    request: Request,
    service: AuthService = Depends(get_auth_service),
) -> UsersOrm:
    token = request.cookies.get("token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    user = await service.get_user_data_by_token(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user


async def ws_get_user_data(
    websocket: WebSocket,
    service: AuthService = Depends(get_auth_service),
) -> UsersOrm:
    token = websocket.cookies.get("token")
    if not token:
        raise WebSocketException(code=4001, reason="Not authenticated")
    try:
        payload = await service.get_token_payload(token)
        user = await service.get_user_by_id(payload.id)
        if not user:
            raise WebSocketException(code=4001, reason="User not found")
        return user
    except WebSocketException:
        raise
    except Exception:
        raise WebSocketException(code=4001, reason="Auth error")
