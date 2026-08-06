from typing import Literal

from pydantic import BaseModel, Field

# Registration token у FCM — до ~200 символов; берём с запасом, но не Text
# без ограничений: колонка индексируется уникальным индексом.
MAX_FCM_TOKEN = 512


class RegisterDeviceToken(BaseModel):
    token: str = Field(min_length=1, max_length=MAX_FCM_TOKEN)
    platform: Literal["android", "ios", "web"] = "android"


class UnregisterDeviceToken(BaseModel):
    token: str = Field(min_length=1, max_length=MAX_FCM_TOKEN)
