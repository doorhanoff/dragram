from __future__ import annotations

import logging
import secrets
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import jwt
from jwt.exceptions import (
    DecodeError,
    ExpiredSignatureError,
    ImmatureSignatureError,
    InvalidAudienceError,
    InvalidIssuerError,
    MissingRequiredClaimError,
)

import redis.asyncio as aioredis

logger = logging.getLogger(__name__)


class RefreshTokenStatus(str, Enum):
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"


class Algorithm(str, Enum):
    HS256 = "HS256"
    HS512 = "HS512"
    RS256 = "RS256"


class TokenType(str, Enum):
    ACCESS  = "access"
    REFRESH = "refresh"


class JWTError(Exception):
    code: str = "JWT_ERROR"
    def __init__(self, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.code = code or self.__class__.code

class TokenExpiredError(JWTError):
    code = "TOKEN_EXPIRED"

class TokenNotYetValidError(JWTError):
    code = "TOKEN_NOT_YET_VALID"

class TokenInvalidError(JWTError):
    code = "TOKEN_INVALID"

class TokenRevokedError(JWTError):
    code = "TOKEN_REVOKED"

class TokenAudienceError(JWTError):
    code = "TOKEN_AUDIENCE_MISMATCH"

class TokenIssuerError(JWTError):
    code = "TOKEN_ISSUER_MISMATCH"

class TokenMissingClaimError(JWTError):
    code = "TOKEN_MISSING_CLAIM"

class TokenTypeMismatchError(JWTError):
    code = "TOKEN_TYPE_MISMATCH"


@dataclass(frozen=True)
class TokenPayload:
    sub: str
    jti: str
    token_type: TokenType
    iat: int
    exp: int
    iss: str | None
    aud: str | list[str] | None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def expires_in(self) -> int:
        return self.exp - int(time.time())

    @property
    def is_expired(self) -> bool:
        return self.expires_in <= 0


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int = 0
    refresh_expires_in: int = 0


class JWTManager:
    def __init__(
        self,
        redis: aioredis.Redis,
        secret_or_private_key: str = "",
        *,
        algorithm: Algorithm = Algorithm.HS256,
        public_key: str | None = None,
        issuer: str | None = None,
        audience: str | list[str] | None = None,
        access_token_ttl: int = 900,
        refresh_token_ttl: int = 604_800,
        leeway: int = 10,
    ) -> None:
        self._sign_key   = secret_or_private_key
        self._verify_key = public_key if public_key else secret_or_private_key
        self._algorithm  = algorithm.value
        self._issuer     = issuer
        self._audience   = audience
        self._access_ttl  = access_token_ttl
        self._refresh_ttl = refresh_token_ttl
        self._leeway      = leeway
        self.redis = redis

    @staticmethod
    def _token_state_key(token_type: TokenType, jti: str) -> str:
        return f"{token_type.value}_token:{jti}"

    async def create_token(
        self,
        subject: str,
        *,
        token_type: TokenType = TokenType.ACCESS,
        ttl: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> str:
        now     = int(time.time())
        expires = now + (ttl if ttl is not None else (
            self._access_ttl if token_type == TokenType.ACCESS else self._refresh_ttl
        ))
        payload: dict[str, Any] = {
            "sub":        subject,
            "iat":        now,
            "exp":        expires,
            "jti":        str(uuid.uuid4()),
            "token_type": token_type.value,
        }
        if self._issuer:
            payload["iss"] = self._issuer
        if self._audience:
            payload["aud"] = self._audience
        if extra:
            reserved = {"sub", "iat", "exp", "jti", "iss", "aud", "nbf", "token_type"}
            if reserved & set(extra.keys()):
                raise ValueError("extra claims must not override reserved keys")
            payload.update(extra)

        token = jwt.encode(payload, self._sign_key, algorithm=self._algorithm)

        if token_type == TokenType.REFRESH:
            await self.redis.set(
                self._token_state_key(TokenType.REFRESH, payload["jti"]),
                RefreshTokenStatus.ACTIVE.value,
                ex=self._refresh_ttl,
            )
        return token

    async def create_token_pair(
        self,
        subject: str,
        *,
        extra: dict[str, Any] | None = None,
    ) -> TokenPair:
        access  = await self.create_token(subject, token_type=TokenType.ACCESS,  extra=extra)
        refresh = await self.create_token(subject, token_type=TokenType.REFRESH, extra=None)
        return TokenPair(
            access_token=access,
            refresh_token=refresh,
            expires_in=self._access_ttl,
            refresh_expires_in=self._refresh_ttl,
        )

    async def verify_token(
        self,
        token: str,
        *,
        expected_type: TokenType | None = TokenType.ACCESS,
    ) -> TokenPayload:
        raw = self._decode(token)
        jti = raw.get("jti", "")
        token_type_str = raw.get("token_type")
        if token_type_str not in {t.value for t in TokenType}:
            raise TokenInvalidError("Missing or invalid token_type claim.")
        actual_type = TokenType(token_type_str)
        if expected_type is not None and actual_type != expected_type:
            raise TokenTypeMismatchError(
                f"Expected {expected_type.value!r}, got {actual_type.value!r}."
            )
        token_status = await self.redis.get(self._token_state_key(actual_type, jti))
        if actual_type == TokenType.REFRESH:
            if token_status is None:
                raise TokenRevokedError(f"Token jti={jti} not found in store.")
            if token_status != RefreshTokenStatus.ACTIVE.value:
                raise TokenRevokedError(f"Token jti={jti} has been revoked.")
        elif token_status == RefreshTokenStatus.REVOKED.value:
            raise TokenRevokedError(f"Token jti={jti} has been revoked.")

        extra = {k: v for k, v in raw.items()
                 if k not in {"sub", "iat", "exp", "jti", "iss", "aud", "nbf", "token_type"}}
        return TokenPayload(
            sub=raw["sub"], jti=jti, token_type=actual_type,
            iat=raw["iat"], exp=raw["exp"],
            iss=raw.get("iss"), aud=raw.get("aud"), extra=extra,
        )

    async def refresh_access_token(
        self,
        refresh_token: str,
        *,
        extra: dict[str, Any] | None = None,
    ) -> TokenPair:
        payload = await self.verify_token(refresh_token, expected_type=TokenType.REFRESH)
        # Rotation: отзываем старый refresh token — он больше не сработает
        await self.revoke_token(refresh_token)
        # Выдаём новую пару
        new_access   = await self.create_token(payload.sub, token_type=TokenType.ACCESS,  extra=extra)
        new_refresh  = await self.create_token(payload.sub, token_type=TokenType.REFRESH)
        return TokenPair(
            access_token=new_access,
            refresh_token=new_refresh,
            expires_in=self._access_ttl,
            refresh_expires_in=self._refresh_ttl,
        )

    async def revoke_token(self, token: str) -> None:
        try:
            raw = self._decode(token)
        except JWTError:
            try:
                raw = jwt.decode(token, options={"verify_signature": False, "verify_exp": False})
            except Exception:
                return
        token_type = TokenType(raw["token_type"])
        ttl = max(int(raw["exp"]) - int(time.time()), 1)
        await self.redis.set(
            self._token_state_key(token_type, raw["jti"]),
            RefreshTokenStatus.REVOKED.value,
            ex=ttl,
        )

    @staticmethod
    def generate_secret(length: int = 64) -> str:
        return secrets.token_hex(length // 2)

    def _decode(self, token: str) -> dict[str, Any]:
        options = {"require": ["sub", "exp", "iat", "jti", "token_type"]}
        kwargs: dict[str, Any] = {
            "algorithms": [self._algorithm],
            "leeway":     self._leeway,
            "options":    options,
        }
        if self._issuer:
            kwargs["issuer"] = self._issuer
        if self._audience:
            kwargs["audience"] = self._audience
        try:
            return jwt.decode(token, self._verify_key, **kwargs)
        except ExpiredSignatureError as exc:
            raise TokenExpiredError("Token has expired.") from exc
        except ImmatureSignatureError as exc:
            raise TokenNotYetValidError("Token is not yet valid.") from exc
        except InvalidAudienceError as exc:
            raise TokenAudienceError(str(exc)) from exc
        except InvalidIssuerError as exc:
            raise TokenIssuerError(str(exc)) from exc
        except MissingRequiredClaimError as exc:
            raise TokenMissingClaimError(str(exc)) from exc
        except DecodeError as exc:
            raise TokenInvalidError(str(exc)) from exc
        except Exception as exc:
            raise TokenInvalidError(str(exc)) from exc
