from typing import Literal

from pydantic import BaseModel


class RegisterDeviceToken(BaseModel):
    token: str
    platform: Literal["android", "ios", "web"] = "android"


class UnregisterDeviceToken(BaseModel):
    token: str
