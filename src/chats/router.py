import uuid
import asyncio
import json

from fastapi import APIRouter, Depends, UploadFile, HTTPException, status, File, WebSocket, WebSocketDisconnect, WebSocketException
from redis.asyncio import Redis

from .depends import get_chats_service, get_chat, ws_get_chat
from .exceptions import ChatNotFound, NotChatMember, InvalidFileType, KeyTargetNotMember
from src.core.rate_limit import make_rate_limiter
from .models import ChatsOrm
from .schemas import (
    CreateChat, ChatsResponse, MessagesResponse,
    WSSendMessage, SetChatKeys, ForwardMessage,
)
from .service import ChatsService
from src.auth.depends import get_current_user, ws_get_current_user
from src.redis.depends import get_redis_client
from ..auth.models import UsersOrm

router = APIRouter(prefix="/chats", tags=["chats"])


@router.post("/create", response_model=ChatsResponse,
             dependencies=[Depends(make_rate_limiter(max_requests=20, window=60))])
async def create(
    data: CreateChat,
    service: ChatsService = Depends(get_chats_service),
    user: UsersOrm = Depends(get_current_user),
):
    return await service.create(data, user)


@router.post("/{chat_id}/photo", response_model=ChatsResponse,
             dependencies=[Depends(make_rate_limiter(max_requests=20, window=60))])
async def upload_photo(
    chat_id: uuid.UUID,
    photo: UploadFile,
    service: ChatsService = Depends(get_chats_service),
    user: UsersOrm = Depends(get_current_user),
):
    return await service.upload_photo_for_chat(chat_id, photo, user)



@router.get("/", response_model=list[ChatsResponse])
async def get_chats(
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
):
    return await service.list_chats(user)


@router.get("/{chat_id}", response_model=ChatsResponse)
async def get_chat_by_id(chat: ChatsOrm = Depends(get_chat)):
    return chat


@router.get("/{chat_id}/messages", response_model=list[MessagesResponse])
async def get_chat_messages(
    chat_id: uuid.UUID,
    limit: int = 50,
    before_id: uuid.UUID | None = None,
    _: ChatsOrm = Depends(get_chat),
    service: ChatsService = Depends(get_chats_service),
):
    msgs = await service.get_messages(chat_id, limit, before_id)
    return [MessagesResponse.from_orm_msg(m) for m in msgs]


@router.put("/{chat_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
    chat: ChatsOrm = Depends(get_chat)
):
    await service.mark_read(chat, user.id)


@router.delete("/{chat_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    chat_id: uuid.UUID,
    message_id: uuid.UUID,
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
):
    deleted = await service.delete_message(message_id, user.id, chat_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Message not found")


@router.post("/{chat_id}/keys", status_code=status.HTTP_204_NO_CONTENT)
async def set_chat_keys(
    chat_id: uuid.UUID,
    body: SetChatKeys,
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
):
    await service.set_chat_keys(chat_id, body.keys, user)



@router.get("/{chat_id}/keys/me")
async def get_my_chat_key(
    chat_id: uuid.UUID,
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
):

    key = await service.get_my_chat_key(chat_id, user)
    return {"encrypted_key": key.encrypted_key}


@router.websocket("/ws/{chat_id}",
                   dependencies=[Depends(make_rate_limiter(max_requests=40, window=60))])
async def chat_websocket(
    ws: WebSocket,
    chat_id: uuid.UUID,
    service: ChatsService = Depends(get_chats_service),
    user: UsersOrm = Depends(ws_get_current_user),
    chat: ChatsOrm = Depends(ws_get_chat),
):

    await ws.accept()

    async with service.get_pubsub_connection(chat_id) as conn:
        async def write_messages():
            async for raw in ws.iter_json():
                await service.handle_incoming_event(raw, chat, user)
        async def broadcast_messages():
            async for message in conn.listen():
                await ws.send_json(message)

        try:
            async with asyncio.TaskGroup() as tg:
                tg.create_task(write_messages())
                tg.create_task(broadcast_messages())
        except* WebSocketDisconnect:
            pass



@router.post("/{chat_id}/forward", status_code=status.HTTP_204_NO_CONTENT)
async def forward_message(
    data: ForwardMessage,
    chat: ChatsOrm = Depends(get_chat),
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
):
    await service.forward_message(user, data, chat)
@router.post("/{chat_id}/upload", response_model=dict)
async def send_media_message(
    file: UploadFile = File(...),
    thumbnail: UploadFile | None = File(None),
    chat: ChatsOrm = Depends(get_chat),
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
):
    try:
        event = await service.send_media_message(user=user, file=file, chat=chat, thumbnail=thumbnail)
        return {"url": event.text}
    except InvalidFileType:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Allowed: jpeg, png, webp, gif, mp4, webm, quicktime, mp3, ogg, wav")
