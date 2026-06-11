import uuid
import datetime
from pydantic import BaseModel, ConfigDict, Field


class CreateAlbum(BaseModel):
    name: str = Field(min_length=1, max_length=50)


class MemberShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    image_url: str | None = None


class AddMember(BaseModel):
    user_id: uuid.UUID


class AlbumResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    creator_id: uuid.UUID
    created_at: datetime.datetime
    cover: str | None = None


class AlbumDetailResponse(AlbumResponse):
    members: list[MemberShort] = []


class MaterialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    link: str
    published_by_id: uuid.UUID
    published_at: datetime.datetime
