import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response, Request, UploadFile, status

from src.config import ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE, settings
from src.core.rate_limit import make_rate_limiter
from src.jwt_auth.jwt_service import JWTError
from src.s3.depends import get_s3_service
from src.s3.exceptions import FileTooLarge
from src.s3.service import S3Service
from .depends import get_auth_service, get_token_payload, get_current_user, extract_token
from .models import UsersOrm
from .schemas import RegisterForm, LoginForm, LogoutBody, DeleteAccountBody, MyProfileResponse, RotateKeysBody, \
    TokenData, UserShortResponse, UpdateProfileForm, PublicKeyBody, KeyBackupBody
from .service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(response: Response, tokens) -> None:
    # secure: браузер не должен отправлять куку по обычному HTTP. Выключается
    # только в режиме разработки, где фронтенд может открываться по http://
    # с адреса в локальной сети.
    secure = not settings.DEBUG
    response.set_cookie("token", tokens.access_token, httponly=True, secure=secure,
                        samesite="lax", max_age=tokens.expires_in)
    response.set_cookie("refresh_token", tokens.refresh_token, httponly=True, secure=secure,
                        samesite="lax", max_age=tokens.refresh_expires_in)


@router.post("/register", status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(make_rate_limiter(max_requests=10, window=3600, fail_closed=True))])
async def register(credentials: RegisterForm, service: AuthService = Depends(get_auth_service)):
    # Занятый номер телефона обрывает register() исключением
    # UserAlreadyExistsError (409) ещё в репозитории.
    user = await service.register(credentials)
    return {"id": user.id}


@router.post("/login", dependencies=[Depends(make_rate_limiter(max_requests=10, window=60, fail_closed=True))])
async def login(credentials: LoginForm, response: Response, service: AuthService = Depends(get_auth_service)):
    tokens = await service.login(credentials)
    if not tokens:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    _set_auth_cookies(response, tokens)

    return tokens


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    body: LogoutBody = Body(default=LogoutBody()),
    service: AuthService = Depends(get_auth_service),
):
    await service.logout(
        access_token=extract_token(request),
        refresh_token=request.cookies.get("refresh_token") or body.refresh_token,
        all_devices=body.all_devices,
    )
    response.delete_cookie("token")
    response.delete_cookie("refresh_token")
    return {"ok": True}


@router.post("/ws-ticket")
async def create_ws_ticket(
    payload: TokenData = Depends(get_token_payload),
    service: AuthService = Depends(get_auth_service),
):
    """Пропуск для подключения к websocket — вместо токена в query-строке."""
    ticket, expires_in = await service.issue_ws_ticket(payload.id)
    return {"ticket": ticket, "expires_in": expires_in}

@router.post("/refresh")
async def refresh(request: Request, response: Response, service: AuthService = Depends(get_auth_service)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            refresh_token = auth[7:]
    if not refresh_token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        tokens = await service.refresh_access_token(refresh_token)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")
    if not tokens:
        raise HTTPException(status_code=401)
    _set_auth_cookies(response, tokens)
    return {"ok": True, "access_token": tokens.access_token, "refresh_token": tokens.refresh_token}


@router.get("/me", response_model=MyProfileResponse)
async def me(
    payload: TokenData = Depends(get_token_payload),
    service: AuthService = Depends(get_auth_service)
):
    user = await service.get_my_profile(payload.id)
    if user is None:
        # Пользователя удалили, а токен ещё жив: это 404, а не 500 при попытке
        # сериализовать None в модель ответа.
        raise HTTPException(status_code=404, detail="User not found")
    await service.set_user_online(payload.id)
    return user


@router.post("/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
async def heartbeat(
    payload: TokenData = Depends(get_token_payload),
    service: AuthService = Depends(get_auth_service),
):
    # Дёргается фронтендом каждые ~25 секунд: достаточно id из токена,
    # полный get_current_user с загрузкой всех чатов здесь ни к чему.
    await service.set_user_online(payload.id)


@router.get("/users/{user_id}", response_model=UserShortResponse)
async def get_user(
    user_id: uuid.UUID,
    _: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    user = await service.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/users", response_model=list[UserShortResponse])
async def get_users(
    # Минимум 3 символа: по одной букве раньше выгружалась половина базы.
    search_text: str | None = Query(default=None, min_length=3, max_length=100),
    # Верхняя граница обязательна: без неё ?limit=100000 вытаскивал в память
    # всю таблицу пользователей.
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    return await service.search_users(search_text, limit=limit, offset=offset)


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


@router.post("/me/keys/rotate", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(make_rate_limiter(max_requests=5, window=3600, fail_closed=True))])
async def rotate_keys(
    body: RotateKeysBody,
    user: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    """Смена ключевой пары E2EE — например, если прежний ключ скомпрометирован
    или забыт пароль от бэкапа. Раньше ключ записывался ровно один раз, и
    сменить его можно было только правкой базы.

    Переписка, зашифрованная старым ключом, после этого не расшифруется:
    клиент предупреждает об этом и требует подтверждение паролем.
    """
    await service.rotate_keys(user.id, body.password, body.public_key, body.key_backup)


@router.get("/me/key-backup")
async def get_key_backup(
    user: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    backup = await service.get_key_backup(user.id)
    if backup is None:
        raise HTTPException(status_code=404, detail="No key backup found")
    return {"key_backup": backup}


@router.patch("/me", response_model=UserShortResponse)
async def update_me(
    form: UpdateProfileForm,
    user: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
):
    await service.update_profile(user.id, form)
    updated = await service.get_user_by_id(user.id)
    return updated


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(make_rate_limiter(max_requests=5, window=3600, fail_closed=True))])
async def delete_me(
    body: DeleteAccountBody,
    response: Response,
    user: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
    s3: S3Service = Depends(get_s3_service),
):
    """Удаление аккаунта и всех своих данных: сообщений, постов, комментариев,
    альбомов и загруженных файлов. Требует подтверждения паролем."""
    await service.delete_account(user.id, body.password, s3)
    response.delete_cookie("token")
    response.delete_cookie("refresh_token")


@router.post("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def upload_avatar(
    photo: UploadFile,
    user: UsersOrm = Depends(get_current_user),
    service: AuthService = Depends(get_auth_service),
    s3: S3Service = Depends(get_s3_service),
):
    if photo.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Allowed: jpeg, png, webp")
    if photo.size and photo.size > MAX_FILE_SIZE:
        raise FileTooLarge()
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
