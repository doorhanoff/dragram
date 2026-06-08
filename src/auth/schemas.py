import uuid
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from pydantic_extra_types.phone_numbers import PhoneNumber


class RUPhone(PhoneNumber):
    default_region_code = 'RU'
    supported_regions = ['RU']
    phone_format = 'NATIONAL'

class RegisterForm(BaseModel):
    name: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=8, max_length=50)
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
    password: str = Field(min_length=8, max_length=50)


class TokenData(BaseModel):
    id: uuid.UUID


class UserShortResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    phone_number: RUPhone
    description: str | None
    image_url: str | None = None
    is_active: bool = False


