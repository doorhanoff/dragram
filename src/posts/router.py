import uuid
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, Request
from .depends import get_posts_service
from .exceptions import PostNotFound, NotPostOwner, InvalidFileType
from .schemas import CreatePost, PostsResponse, PostDetailResponse, CreateComment, CommentResponse
from .service import PostsService
from src.auth.depends import get_token_payload, get_current_user
from src.auth.schemas import TokenData
from src.auth.models import UsersOrm
from ..core.rate_limit import make_rate_limiter

router = APIRouter(
    prefix="/posts",
    tags=["posts"],
)


def _post_from_dict(d: dict) -> PostsResponse:
    """Собирает PostsResponse из orm + счётчики."""
    orm = d["orm"]
    data = PostsResponse.model_validate(orm)
    data.likes_count   = d["likes_count"]
    data.is_liked      = d["is_liked"]
    data.is_bookmarked = d["is_bookmarked"]
    return data


@router.get("/", response_model=list[PostsResponse])
async def get_all(
    text: str | None = None,
    limit: int = 20,
    offset: int = 0,
    filter: Literal["all", "friends", "saved"] = "all",
    user: UsersOrm | None = Depends(lambda: None),
    service: PostsService = Depends(get_posts_service),
    request: Request = None,
):
    # Пытаемся получить текущего пользователя (опционально)
    current_user_id = None
    try:
        from src.auth.depends import _extract_token
        from src.jwt_auth.depends import get_jwt_manager
        from src.db.database import async_session
        from src.auth.repo import AuthRepository
        token = _extract_token(request)
        if token:
            from src.jwt_auth.jwt_service import JWTManager
            from src.config import settings
            from src.redis.redis_service import get_redis
            jm = JWTManager(get_redis(), secret_or_private_key=settings.JWT_SECRET_KEY)
            payload = await jm.verify_token(token)
            current_user_id = uuid.UUID(payload.sub)
    except Exception:
        pass

    rows = await service.search(text, limit, offset, filter, current_user_id)
    return [_post_from_dict(r) for r in rows]


@router.get("/{post_id}", response_model=PostDetailResponse)
async def get_one(post_id: uuid.UUID, service: PostsService = Depends(get_posts_service)):
    try:
        return await service.get_detail(post_id)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")


@router.post("/create", response_model=PostsResponse, dependencies=[Depends(make_rate_limiter(max_requests=5, window=60))])
async def create(
    data: CreatePost,
    service: PostsService = Depends(get_posts_service),
    payload: TokenData = Depends(get_token_payload)
):
    return await service.create(data, payload.id)


@router.post("/{post_id}/media", response_model=PostsResponse)
async def upload_media(
    post_id: uuid.UUID,
    files: Annotated[list[UploadFile], File(description="Один или несколько файлов (фото/видео)")],
    service: PostsService = Depends(get_posts_service),
    payload: TokenData = Depends(get_token_payload),
):
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files provided")
    try:
        return await service.upload_media(post_id, files, payload.id)
    except PostNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    except NotPostOwner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the post owner")
    except InvalidFileType:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Allowed types: jpeg, png, webp, gif, mp4, webm")



@router.post("/{post_id}/like")
async def toggle_like(
    post_id: uuid.UUID,
    service: PostsService = Depends(get_posts_service),
    payload: TokenData = Depends(get_token_payload),
):
    try:
        liked = await service.toggle_like(post_id, payload.id)
        return {"liked": liked}
    except PostNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")


@router.post("/{post_id}/bookmark")
async def toggle_bookmark(
    post_id: uuid.UUID,
    service: PostsService = Depends(get_posts_service),
    payload: TokenData = Depends(get_token_payload),
):
    try:
        bookmarked = await service.toggle_bookmark(post_id, payload.id)
        return {"bookmarked": bookmarked}
    except PostNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")


@router.post("/{post_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(make_rate_limiter(max_requests=30, window=60))])
async def add_comment(
    post_id: uuid.UUID,
    data: CreateComment,
    service: PostsService = Depends(get_posts_service),
    payload: TokenData = Depends(get_token_payload),
):
    try:
        return await service.add_comment(data, post_id, payload.id)
    except PostNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")


@router.get("/{post_id}/comments", response_model=list[CommentResponse])
async def get_comments(
    post_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
    service: PostsService = Depends(get_posts_service),
):
    try:
        return await service.get_comments(post_id, limit, offset)
    except PostNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    comment_id: uuid.UUID,
    service: PostsService = Depends(get_posts_service),
    payload: TokenData = Depends(get_token_payload),
):
    deleted = await service.delete_comment(comment_id, payload.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found or not yours")
