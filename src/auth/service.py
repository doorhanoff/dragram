import uuid
import asyncio
from .repo import AuthRepository
from .schemas import RegisterForm, CreateUser, LoginForm, TokenData
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
    def __init__(self, repo: AuthRepository, jwt_manager: JWTManager):
        self.repo = repo
        self.jwt_manager = jwt_manager

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
        reference = user.password_hash if user else await _get_dummy_hash()
        ok = await asyncio.to_thread(verify_password, credentials.password, reference)
        if not ok or not user:
            return None
        return await self.jwt_manager.create_token_pair(
            subject=str(user.id),
        )

    async def get_token_payload(self, access_token: str) -> TokenData:
        payload = await self.jwt_manager.verify_token(access_token)
        return TokenData(id=uuid.UUID(payload.sub))

    async def get_user_by_id(self, user_id: uuid.UUID) -> UsersOrm | None:
        return await self.repo.get_user_by_id(user_id)

    async def get_user_data_by_token(self, access_token: str) -> UsersOrm | None:
        payload = await self.jwt_manager.verify_token(access_token)
        return await self.repo.get_user_by_id(uuid.UUID(payload.sub))

    async def revoke_token(self, token: str) -> None:
        await self.jwt_manager.revoke_token(token)

    async def refresh_access_token(self, refresh_token: str) -> TokenPair | None:
        payload = await self.jwt_manager.verify_token(refresh_token, expected_type=TokenType.REFRESH)
        user = await self.repo.get_user_by_id(uuid.UUID(payload.sub))
        if not user:
            return None
        return await self.jwt_manager.refresh_access_token(refresh_token=refresh_token)

    async def search_users(self, search_text: str, offset: int = 0, limit: int = 10) -> list[UsersOrm]:
        return await self.repo.search(search_text, offset, limit)

    async def set_key_backup(self, user_id: uuid.UUID, backup: str) -> None:
        await self.repo.set_key_backup(user_id, backup)

    async def get_key_backup(self, user_id: uuid.UUID) -> str | None:
        return await self.repo.get_key_backup(user_id)

    async def set_active(self, user_id: uuid.UUID, active: bool) -> None:
        await self.repo.set_active(user_id, active)

    async def update_profile(self, user_id: uuid.UUID, name: str | None, description: str | None) -> None:
        await self.repo.update_profile(user_id, name, description)

    async def upload_avatar(self, user_id: uuid.UUID, file, s3) -> str:
        url = await s3.upload_file(file.file, file.content_type)
        await self.repo.update_avatar(user_id, url)
        return url

    async def set_public_key(self, user_id: uuid.UUID, public_key: str) -> None:
        await self.repo.set_public_key(user_id, public_key)

    async def get_public_key(self, user_id: uuid.UUID) -> str | None:
        return await self.repo.get_public_key(user_id)

