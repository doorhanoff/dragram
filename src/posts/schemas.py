import uuid
import json
import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator


class CreatePost(BaseModel):
    title: str = Field(max_length=200, min_length=5)
    description: str | None = Field(default=None, max_length=1024, min_length=5)


class AuthorShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    image_url: str | None = None


class PostsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: str | None
    materials: list[str] = []
    created_by_id: uuid.UUID | None
    created_by: AuthorShort | None = None
    created_at: datetime.datetime
    likes_count:   int  = 0
    is_liked:      bool = False
    is_bookmarked: bool = False

    @field_validator('materials', mode='before')
    @classmethod
    def parse_materials(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v or []


class PostDetailResponse(PostsResponse):
    pass


class CreateComment(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    reply_to_id: uuid.UUID | None = None


class CommentReplyShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    text: str
    created_by: AuthorShort | None = None


class CommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    text: str
    post_id: uuid.UUID
    created_by_id: uuid.UUID
    created_by: AuthorShort | None = None
    reply_to_id: uuid.UUID | None = None
    reply_to: CommentReplyShort | None = None
    created_at: datetime.datetime
