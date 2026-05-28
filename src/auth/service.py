import uuid
from .repo import AuthRepository
from .schemas import RegisterForm, CreateUser, LoginForm, TokenData
from .models import UsersOrm
from src.core.hashing import hash_password, verify_password
from src.jwt_auth.jwt_service import JWTManager, TokenPair, TokenType

_DUMMY_HASH: str = hash_password("__dummy__")


class AuthService:
    def __init__(self, repo: AuthRepository, jwt_manager: JWTManager):
        self.repo = repo
        self.jwt_manager = jwt_manager

    async def register(self, credentials: RegisterForm) -> UsersOrm:
        hashed = hash_password(credentials.password)
        user = CreateUser(
            name=credentials.name,
            phone_number=credentials.phone_number,
            password_hash=hashed,
            description=credentials.description,
        )
        return await self.repo.create_user(user)

    async def login(self, credentials: LoginForm) -> TokenPair | None:
        user = await self.repo.get_user_by_email(credentials.email)
        reference = user.password_hash if user else _DUMMY_HASH
        if not verify_password(credentials.password, reference) or not user:
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
        token = await self.jwt_manager.verify_token(refresh_token, expected_type=TokenType.REFRESH)
        user = await self.repo.get_user_by_id(uuid.UUID(token.sub))
        if not user:
            return None
        return await self.jwt_manager.refresh_access_token(
            refresh_token=refresh_token,
        )
