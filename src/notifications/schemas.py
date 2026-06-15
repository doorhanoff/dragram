from pydantic import BaseModel


class RegisterDeviceToken(BaseModel):
    token: str
    platform: str = "android"


class UnregisterDeviceToken(BaseModel):
    token: str
