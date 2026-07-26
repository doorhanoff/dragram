import uuid
import asyncio

from redis.asyncio import Redis

from src.jwt_auth.jwt_service import TokenInvalidError
from .exceptions import InvalidTokenError, UserNotFoundError
from .repo import AuthRepository
from .schemas import RegisterForm, CreateUser, LoginForm, TokenData, UserShortResponse, UpdateProfileForm
from .models import UsersOrm
from src.core.hashing import hash_password, verify_password
from src.jwt_auth.jwt_service import JWTManager, TokenPair, TokenType

_DUMMY_HASH: str | None = None

async def _get_dummy_hash() -> str:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = await asyncio.to_thread(hash_password, "__dummy__")
    return _DUMMY_HASH


class AuthService:
    def __init__(self, repo: AuthRepository, jwt_manager: JWTManager, redis: Redis):
        self.repo = repo
        self.jwt_manager = jwt_manager
        self.redis = redis

    async def register(self, credentials: RegisterForm) -> UsersOrm:
        hashed = await asyncio.to_thread(hash_password, credentials.password)
        user = CreateUser(
            name=credentials.name,
            phone_number=credentials.phone_number,
            password_hash=hashed,
            description=credentials.description,
        )
        return await self.repo.create_user(user)

    async def login(self, credentials: LoginForm) -> TokenPair | None:
        user = await self.repo.get_user_by_phone(credentials.phone_number)
        password_hash = user.password_hash if user else await _get_dummy_hash()
        ok = await asyncio.to_thread(verify_password, credentials.password, password_hash)
        if not ok or not user:
            return None
        return await self.jwt_manager.create_token_pair(
            subject=str(user.id),
        )

    async def get_token_payload(self, access_token: str) -> TokenData:
        payload = await self.jwt_manager.verify_token(access_token)
        return TokenData(id=uuid.UUID(payload.sub))

    async def get_user_by_id(self, user_id: uuid.UUID) -> UserShortResponse | None:
        user = await self.repo.get_user_by_id(user_id)
        if not user:
            return None
        is_online = await self.redis.exists(f"online:{user_id}")
        response = UserShortResponse.model_validate(user)
        response.is_active = bool(is_online)
        return response

    async def get_user_data_by_token(self, access_token: str) -> UsersOrm | None:
        payload = await self.jwt_manager.verify_token(access_token)
        return await self.repo.get_user_by_id(uuid.UUID(payload.sub))

    async def revoke_token(self, token: str) -> None:
        try:
            await self.jwt_manager.revoke_token(token)
        except TokenInvalidError:
            raise InvalidTokenError()

    async def refresh_access_token(self, refresh_token: str) -> TokenPair | None:
        try: payload = await self.jwt_manager.verify_token(refresh_token)
        except TokenInvalidError: raise InvalidTokenError()
        user = await self.repo.get_user_by_id(uuid.UUID(payload.sub))
        if not user:
            raise UserNotFoundError()
        return await self.jwt_manager.refresh_access_token(refresh_token=refresh_token)

    async def search_users(self, search_text: str | None, offset: int = 0, limit: int = 10) -> list[UserShortResponse]:
        users = await self.repo.search(search_text, offset, limit)
        results = []
        for u in users:
            is_online = await self.redis.exists(f"online:{u.id}")
            response = UserShortResponse.model_validate(u)
            response.is_active = bool(is_online)
            results.append(response)
        return results

    async def set_key_backup(self, user_id: uuid.UUID, backup: str) -> None:
        await self.repo.set_key_backup(user_id, backup)

    async def get_key_backup(self, user_id: uuid.UUID) -> str | None:
        return await self.repo.get_key_backup(user_id)

    async def update_profile(self, user_id: uuid.UUID, form: UpdateProfileForm) -> None:
        await self.repo.update_profile(user_id, form)

    async def upload_avatar(self, user_id: uuid.UUID, file, s3) -> str:
        url = await s3.upload_file(file.file, file.content_type)
        await self.repo.update_avatar(user_id, url)
        return url

    async def set_public_key(self, user_id: uuid.UUID, public_key: str) -> None:
        await self.repo.set_public_key(user_id, public_key)

    async def get_public_key(self, user_id: uuid.UUID) -> str | None:
        return await self.repo.get_public_key(user_id)

    async def set_user_online(self, user_id: uuid.UUID) -> None:
        await self.redis.set(f"online:{user_id}", "1", ex=60)




