import uuid
from typing import Annotated, Literal
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query, status
from .depends import get_posts_service
from .schemas import CreatePost, PostsResponse, PostDetailResponse, CreateComment, CommentResponse
from .service import PostsService
from src.auth.depends import get_token_payload
from src.auth.schemas import TokenData
from ..core.rate_limit import make_rate_limiter

router = APIRouter(
    prefix="/posts",
    tags=["posts"],
)


def _post_from_dict(d: dict) -> PostsResponse:
    orm = d["orm"]
    data = PostsResponse.model_validate(orm)
    data.likes_count   = d["likes_count"]
    data.is_liked      = d["is_liked"]
    data.is_bookmarked = d["is_bookmarked"]
    return data


# Лента и комментарии закрыты авторизацией: сервис рассчитан на полсотни своих
# людей, а раньше всю ленту с именами и аватарами авторов читал любой человек
# из интернета — включая комментарии, где зависимости авторизации не было вовсе.
@router.get("/", response_model=list[PostsResponse])
async def get_all(
    text: str | None = Query(default=None, max_length=100),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    filter: Literal["all", "friends", "saved"] = "all",
    payload: TokenData = Depends(get_token_payload),
    service: PostsService = Depends(get_posts_service),
):
    rows = await service.search(text, limit, offset, filter, payload.id)
    return [_post_from_dict(r) for r in rows]


@router.get("/{post_id}", response_model=PostDetailResponse)
async def get_one(
    post_id: uuid.UUID,
    _: TokenData = Depends(get_token_payload),
    service: PostsService = Depends(get_posts_service),
):
    return await service.get_detail(post_id)


@router.post("/create", response_model=PostsResponse, dependencies=[Depends(make_rate_limiter(max_requests=5, window=60))])
async def create(
    data: CreatePost,
    service: PostsService = Depends(get_posts_service),
    payload: TokenData = Depends(get_token_payload)
):
    return await service.create(data, payload.id)


@router.post("/{post_id}/media", response_model=PostsResponse,
             dependencies=[Depends(make_rate_limiter(max_requests=10, window=60))])
async def upload_media(
    post_id: uuid.UUID,
    files: Annotated[list[UploadFile], File(description="Один или несколько файлов (фото/видео)")],
    service: PostsService = Depends(get_posts_service),
    payload: TokenData = Depends(get_token_payload),
):
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files provided")
    return await service.upload_media(post_id, files, payload.id)


@router.post("/{post_id}/like",
             dependencies=[Depends(make_rate_limiter(max_requests=60, window=60))])
async def toggle_like(
    post_id: uuid.UUID,
    service: PostsService = Depends(get_posts_service),
    payload: TokenData = Depends(get_token_payload),
):
    liked = await service.toggle_like(post_id, payload.id)
    return {"liked": liked}


@router.post("/{post_id}/bookmark",
             dependencies=[Depends(make_rate_limiter(max_requests=60, window=60))])
async def toggle_bookmark(
    post_id: uuid.UUID,
    service: PostsService = Depends(get_posts_service),
    payload: TokenData = Depends(get_token_payload),
):
    bookmarked = await service.toggle_bookmark(post_id, payload.id)
    return {"bookmarked": bookmarked}


@router.post("/{post_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(make_rate_limiter(max_requests=30, window=60))])
async def add_comment(
    post_id: uuid.UUID,
    data: CreateComment,
    service: PostsService = Depends(get_posts_service),
    payload: TokenData = Depends(get_token_payload),
):
    return await service.add_comment(data, post_id, payload.id)


@router.get("/{post_id}/comments", response_model=list[CommentResponse])
async def get_comments(
    post_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    _: TokenData = Depends(get_token_payload),
    service: PostsService = Depends(get_posts_service),
):
    return await service.get_comments(post_id, limit, offset)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(make_rate_limiter(max_requests=30, window=60))])
async def delete_comment(
    comment_id: uuid.UUID,
    service: PostsService = Depends(get_posts_service),
    payload: TokenData = Depends(get_token_payload),
):
    deleted = await service.delete_comment(comment_id, payload.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found or not yours")
