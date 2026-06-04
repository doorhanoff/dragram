import uuid
from fastapi import APIRouter, Depends, HTTPException, Response, Request, UploadFile, status
from pydantic import BaseModel
from .depends import get_auth_service, get_token_payload, get_current_user
from .models import UsersOrm
from .schemas import RegisterForm, LoginForm, TokenData, UserShortResponse
from .service import AuthService
from src.jwt_auth.jwt_service import JWTError
from src.core.rate_limit import make_rate_limiter
from src.s3.depends import get_s3_service
from src.s3.service import S3Service
from src.redis.depends import get_redis_client
from redis.asyncio import Redis

ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp"}
ONLINE_TTL = 180  # секунд без heartbeat → пользователь оффлайн

async def _set_online(user_id: uuid.UUID, redis: Redis) -> None:
    await redis.set(f"online:{user_id}", "1", ex=ONLINE_TTL)

async def _set_offline(user_id: uuid.UUID, redis: Redis) -> None:
    await redis.delete(f"online:{user_id}")


class PublicKeyBody(BaseModel):
    public_key: str

class KeyBackupBody(BaseModel):
    key_backup: str

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(make_rate_limiter(max_requests=5, window=60))])
async def register(credentials: RegisterForm, service: AuthService = Depends(get_auth_service)):
    user = await service.register(credentials)
    if not user:
        raise HTTPException(status_code=400, detail="User already exists")
    return {"id": user.id}


@router.post("/login",
             dependencies=[Depends(make_rate_limiter(max_requests=10, window=60))])
async def login(credentials: LoginForm, response: Response, service: AuthService = Depends(get_auth_service)):
    tokens = await service.login(credentials)
    if not tokens:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    response.set_cookie("token", tokens.access_token, httponly=True, samesite="lax", secure=True)
    response.set_cookie("refresh_token", tokens.refresh_token, httponly=True, samesite="lax", secure=True)

    return {"ok": True, "access_token": tokens.access_token, "refresh_token": tokens.refresh_token}


@router.post("/logout")
async def logout(request: Request, response: Response, service: AuthService = Depends(get_auth_service)):
    token = request.cookies.get("refresh_token")
    if token:
        await service.revoke_token(token)

    try:
        payload = await service.get_token_payload(request.cookies.get("token", ""))
        await service.set_active(payload.id, False)
    except Exception:
        pass
    response.delete_cookie("token")
    response.delete_cookie("refresh_token")
    return {"ok": True}


@router.post("/offline", status_code=status.HTTP_204_NO_CONTENT)
async def set_offline(
    user: UsersOrm = Depends(get_current_user),
    redis: Redis = Depends(get_redis_client),
):
    await _set_offline(user.id, redis)


@router.post("/refresh")
async def refresh(request: Request, response: Response, service: AuthService = Depends(get_auth_service)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        tokens = await service.refresh_access_token(refresh_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    if not tokens:
        raise HTTPException(status_code=401)
    response.set_cookie("token",         tokens.access_token,  httponly=True, samesite="lax", secure=True)
    response.set_cookie("refresh_token", tokens.refresh_token, httponly=True, samesite="lax", secure=True)
    return {"ok": True}


@router.get("/me", response_model=UserShortResponse)
async def me(
    payload: TokenData = Depends(get_token_payload),
    service: AuthService = Depends(get_auth_service),
    redis: Redis = Depends(get_redis_client),
):
    user = await service.get_user_by_id(payload.id)
    if not user:
        raise HTTPException(status_code=404)
    await _set_online(payload.id, redis)
    return user


@router.post("/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
async def heartbeat(
    user: UsersOrm = Depends(get_current_user),
    redis: Redis = Depends(get_redis_client),
):

    await _set_online(user.id, redis)


@router.get("/users/{user_id}", response_model=UserShortResponse)
async def get_user(
    user_id: uuid.UUID,
    _: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    user = await service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/users", response_model=list[UserShortResponse])
async def get_users(search_text: str | None, limit: int = 10, offset: int = 0, user: UsersOrm = Depends(get_current_user), service: AuthService = Depends(get_auth_service)):
    return await service.search_users(search_text, limit, offset)


@router.put("/me/public-key", status_code=status.HTTP_204_NO_CONTENT)
async def set_public_key(
    body: PublicKeyBody,
    user: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    await service.set_public_key(user.id, body.public_key)


@router.put("/me/key-backup", status_code=status.HTTP_204_NO_CONTENT)
async def set_key_backup(
    body: KeyBackupBody,
    user: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):

    await service.set_key_backup(user.id, body.key_backup)


@router.get("/me/key-backup")
async def get_key_backup(
    user: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    backup = await service.get_key_backup(user.id)
    if backup is None:
        raise HTTPException(status_code=404, detail="No key backup found")
    return {"key_backup": backup}


@router.post("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def upload_avatar(
    photo: UploadFile,
    user: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
    s3: S3Service = Depends(get_s3_service),
):
    if photo.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=400, detail="Allowed: jpeg, png, webp")
    await service.upload_avatar(user.id, photo, s3)


@router.get("/users/{user_id}/public-key")
async def get_public_key(
    user_id: uuid.UUID,
    _: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    key = await service.get_public_key(user_id)
    if key is None:
        raise HTTPException(status_code=404, detail="Public key not found")
    return {"public_key": key}
