import uuid
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from pydantic_extra_types.phone_numbers import PhoneNumber


class RUPhone(PhoneNumber):
    default_region_code = 'RU'
    supported_regions = ['RU']
    phone_format = 'NATIONAL'

# Argon2 не ограничивает длину пароля, а короткий потолок мешает длинным
# парольным фразам — это единственное, что реально стоит поощрять.
MAX_PASSWORD_LENGTH = 128


class RegisterForm(BaseModel):
    name: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=8, max_length=MAX_PASSWORD_LENGTH)
    phone_number: RUPhone
    description: str | None = Field(default=None, max_length=200)



class CreateUser(BaseModel):
    name: str
    password_hash: str
    phone_number: RUPhone
    description: str | None = None


class UpdateProfileForm(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=50)
    description: str | None = Field(default=None, max_length=200)


class LoginForm(BaseModel):
    phone_number: RUPhone
    password: str = Field(min_length=8, max_length=MAX_PASSWORD_LENGTH)


class TokenData(BaseModel):
    id: uuid.UUID


class UserShortResponse(BaseModel):
    """Чужой профиль: телефона здесь нет намеренно. Раньше он ехал в каждом
    результате поиска, и один запрос выгружал телефонную книгу всего сервиса."""
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str | None
    image_url: str | None = None
    is_active: bool = False


class MyProfileResponse(UserShortResponse):
    """Свой профиль (/auth/me) — здесь телефон уместен."""
    phone_number: RUPhone


class PublicKeyBody(BaseModel):
    # base64 от raw-ключа P-256 — это 88 символов, запас на форматы совместимости.
    public_key: str = Field(min_length=1, max_length=200)


class KeyBackupBody(BaseModel):
    # base64(JSON{salt, iv, ct}) от JWK приватного ключа — порядка 500 символов.
    key_backup: str = Field(min_length=1, max_length=4000)


class RotateKeysBody(PublicKeyBody, KeyBackupBody):
    """Смена ключевой пары E2EE. Пароль — то же подтверждение, что и при
    удалении аккаунта: подмена публичного ключа не должна быть доступна
    по одному украденному токену."""
    password: str = Field(min_length=8, max_length=MAX_PASSWORD_LENGTH)


class DeleteAccountBody(BaseModel):
    """Удаление аккаунта необратимо, поэтому подтверждается паролем —
    одного украденного токена для него быть не должно."""
    password: str = Field(min_length=8, max_length=MAX_PASSWORD_LENGTH)


class LogoutBody(BaseModel):
    """Мобильный клиент не использует куки, поэтому refresh-токен для отзыва
    приходится передавать явно."""
    refresh_token: str | None = Field(default=None, max_length=4000)
    # «Выйти на всех устройствах»: разом отзывает все выданные токены.
    all_devices: bool = False

