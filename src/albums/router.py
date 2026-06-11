import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from .depends import get_albums_service
from .exceptions import AlbumNotFound, NotAlbumMember, InvalidFileType
from .schemas import CreateAlbum, AlbumResponse, AlbumDetailResponse, AddMember, MaterialResponse
from .service import AlbumsService
from src.auth.depends import get_token_payload
from src.auth.schemas import TokenData

router = APIRouter(
    prefix="/albums",
    tags=["albums"],
)


@router.get("/", response_model=list[AlbumResponse])
async def get_albums(
    service: AlbumsService = Depends(get_albums_service),
    payload: TokenData = Depends(get_token_payload),
):
    return await service.get_user_albums(payload.id)


@router.post("/create", response_model=AlbumDetailResponse, status_code=status.HTTP_201_CREATED)
async def create(
    data: CreateAlbum,
    service: AlbumsService = Depends(get_albums_service),
    payload: TokenData = Depends(get_token_payload),
):
    return await service.create(data, payload.id)


@router.get("/{album_id}", response_model=AlbumDetailResponse)
async def get_one(
    album_id: uuid.UUID,
    service: AlbumsService = Depends(get_albums_service),
    payload: TokenData = Depends(get_token_payload),
):
    try:
        return await service.get_detail(album_id, payload.id)
    except AlbumNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    except NotAlbumMember:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this album")


@router.post("/{album_id}/members", status_code=status.HTTP_204_NO_CONTENT)
async def add_member(
    album_id: uuid.UUID,
    data: AddMember,
    service: AlbumsService = Depends(get_albums_service),
    payload: TokenData = Depends(get_token_payload),
):
    try:
        await service.add_member(album_id, data.user_id, payload.id)
    except AlbumNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    except NotAlbumMember:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this album")


@router.delete("/{album_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    album_id: uuid.UUID,
    user_id: uuid.UUID,
    service: AlbumsService = Depends(get_albums_service),
    payload: TokenData = Depends(get_token_payload),
):
    try:
        await service.remove_member(album_id, user_id, payload.id)
    except AlbumNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    except NotAlbumMember:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this album")


@router.get("/{album_id}/materials", response_model=list[MaterialResponse])
async def get_materials(
    album_id: uuid.UUID,
    service: AlbumsService = Depends(get_albums_service),
    payload: TokenData = Depends(get_token_payload),
):
    try:
        return await service.get_materials(album_id, payload.id)
    except AlbumNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    except NotAlbumMember:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this album")


@router.post("/{album_id}/materials", response_model=list[MaterialResponse])
async def upload_materials(
    album_id: uuid.UUID,
    files: Annotated[list[UploadFile], File(description="Один или несколько файлов (фото/видео)")],
    service: AlbumsService = Depends(get_albums_service),
    payload: TokenData = Depends(get_token_payload),
):
    if not files:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No files provided")
    try:
        return await service.upload_materials(album_id, files, payload.id)
    except AlbumNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Album not found")
    except NotAlbumMember:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this album")
    except InvalidFileType:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Allowed types: jpeg, png, webp, gif, mp4, webm")
