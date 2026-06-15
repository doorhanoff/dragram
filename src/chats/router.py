import uuid
import asyncio
import json

from fastapi import APIRouter, Depends, UploadFile, HTTPException, status, File, WebSocket, WebSocketDisconnect, WebSocketException
from redis.asyncio import Redis

from .depends import get_chats_service, get_chat
from .exceptions import ChatNotFound, NotChatMember, InvalidFileType, KeyTargetNotMember
from src.core.rate_limit import make_rate_limiter
from .models import ChatsOrm
from .repo import ChatsRepository
from .schemas import (
    CreateChat, ChatsResponse, MessagesResponse,
    MessageDbSchema, MessageSchema, SetChatKeys,
)
from .service import ChatsService
from src.auth.depends import get_current_user
from src.auth.repo import AuthRepository
from src.db.database import async_session
from src.jwt_auth.depends import get_jwt_manager
from src.jwt_auth.jwt_service import JWTManager, JWTError
from src.notifications.repo import NotificationsRepository
from src.notifications.service import NotificationsService
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


@router.post("/{chat_id}/photo", response_model=ChatsResponse)
async def upload_photo(
    chat_id: uuid.UUID,
    photo: UploadFile,
    service: ChatsService = Depends(get_chats_service),
    user: UsersOrm = Depends(get_current_user),
):
    try:
        return await service.upload_photo_for_chat(chat_id, photo, user)
    except ChatNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    except NotChatMember:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    except InvalidFileType:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Allowed: jpeg, png, webp")


@router.get("/", response_model=list[ChatsResponse])
async def get_chats(
    user: UsersOrm = Depends(get_current_user),
    redis: Redis = Depends(get_redis_client),
):
    chats = user.chats
    # Обогащаем is_active из Redis (TTL-ключи)
    for chat in chats:
        for member in getattr(chat, 'members', []):
            key_exists = await redis.exists(f"online:{member.id}")
            member.is_active = bool(key_exists)
        chat.unread_count = sum(
            1 for m in chat.messages if not m.is_read and m.sender_id != user.id
        )
    return chats


@router.get("/{chat_id}", response_model=ChatsResponse)
async def get_chat_by_id(chat: ChatsOrm = Depends(get_chat)):
    return chat


@router.get("/{chat_id}/messages", response_model=list[MessagesResponse])
async def get_chat_messages(
    chat_id: uuid.UUID,
    limit: int = 50,
    before_id: uuid.UUID | None = None,
    chat: ChatsOrm = Depends(get_chat),
    service: ChatsService = Depends(get_chats_service),
):
    msgs = await service.repo.get_messages_paginated(chat_id, limit, before_id)
    return [MessagesResponse.from_orm_msg(m) for m in msgs]


@router.put("/{chat_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(
    chat_id: uuid.UUID,
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
    redis: Redis = Depends(get_redis_client),
):
    msg_ids = await service.mark_read(chat_id, user.id)
    if msg_ids:
        await redis.publish(f"chat:{chat_id}", json.dumps({
            "event": "read",
            "message_ids": [str(mid) for mid in msg_ids],
            "reader_id": str(user.id),
        }))


@router.delete("/{chat_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_message(
    chat_id: uuid.UUID,
    message_id: uuid.UUID,
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
    redis: Redis = Depends(get_redis_client),
):
    deleted = await service.delete_message(message_id, user.id, chat_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Message not found or not yours")
    await redis.publish(f"chat:{chat_id}", json.dumps({
        "event": "delete",
        "message_id": str(message_id),
    }))


@router.post("/{chat_id}/keys", status_code=status.HTTP_204_NO_CONTENT)
async def set_chat_keys(
    chat_id: uuid.UUID,
    body: SetChatKeys,
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
):
    try:
        await service.set_chat_keys(chat_id, body.keys, user)
    except ChatNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    except NotChatMember:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    except KeyTargetNotMember:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Key target not a member")


@router.get("/{chat_id}/keys/me")
async def get_my_chat_key(
    chat_id: uuid.UUID,
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
):
    try:
        key = await service.get_my_chat_key(chat_id, user)
    except ChatNotFound:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
    except NotChatMember:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member")
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found")
    return {"encrypted_key": key.encrypted_key}


@router.websocket("/ws/{chat_id}")
async def chat_websocket(
    ws: WebSocket,
    chat_id: uuid.UUID,
    redis: Redis = Depends(get_redis_client),
    jwt_manager: JWTManager = Depends(get_jwt_manager),
):
    # 1. Auth
    token = ws.cookies.get("token")
    if not token:
        raise WebSocketException(code=4001, reason="Not authenticated")
    try:
        payload = await jwt_manager.verify_token(token)
        user_id = uuid.UUID(payload.sub)
    except JWTError:
        raise WebSocketException(code=4001, reason="Invalid token")

    # 2. Membership check + set online
    async with async_session() as session:
        repo = ChatsRepository(session)
        chat = await repo.get_by_id(chat_id)
        if not chat or user_id not in chat.members_ids:
            raise WebSocketException(code=4003, reason="Not a member")
        auth_repo = AuthRepository(session)
        await auth_repo.set_active(user_id, True)

    await ws.accept()

    channel = f"chat:{chat_id}"
    pubsub  = redis.pubsub()
    await pubsub.subscribe(channel)

    async def write_messages():
        async for data in ws.iter_json():
            event = data.get("event")
            if event == "read":
                async with async_session() as session:
                    repo = ChatsRepository(session)
                    msg_ids = await repo.mark_read(chat_id, user_id)
                if msg_ids:
                    await redis.publish(channel, json.dumps({
                        "event": "read",
                        "message_ids": [str(m) for m in msg_ids],
                        "reader_id": str(user_id),
                    }))
            else:
                async with async_session() as session:
                    repo = ChatsRepository(session)
                    msg = await repo.create_message(
                        MessageDbSchema(
                            text=data["text"],
                            sender_id=user_id,
                            chat_id=chat_id,
                            type=data.get("type", "text"),
                        )
                    )
                payload_out = {
                    "event":       "message",
                    "id":          str(msg.id),
                    "text":        data["text"],
                    "writer":      str(user_id),
                    "sender_id":   str(user_id),
                    "sender_name": msg.sender.name if msg.sender else None,
                    "type":        data.get("type", "text"),
                    "date":        msg.created_at.isoformat(),
                    "is_read":     False,
                }
                await redis.publish(channel, json.dumps(payload_out))

                recipient_ids = [m for m in chat.members_ids if m != user_id]
                offline_ids = [rid for rid in recipient_ids if not await redis.exists(f"online:{rid}")]
                if offline_ids:
                    body = {
                        "image": "\U0001F4F7 Фото",
                        "video": "\U0001F3A5 Видео",
                        "audio": "\U0001F3B5 Голосовое сообщение",
                    }.get(data.get("type", "text"), data["text"][:100])
                    async with async_session() as session:
                        notif_repo = NotificationsRepository(session)
                        notif_service = NotificationsService(notif_repo)
                        await notif_service.notify_users(
                            offline_ids,
                            title=msg.sender.name if msg.sender else "Новое сообщение",
                            body=body,
                            data={"chat_id": str(chat_id), "event": "message"},
                        )


    async def broadcast_messages():
        async for raw in pubsub.listen():
            if raw["type"] == "message":
                await ws.send_json(json.loads(raw["data"]))

    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(write_messages())
            tg.create_task(broadcast_messages())
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
        async with async_session() as session:
            auth_repo = AuthRepository(session)
            await auth_repo.set_active(user_id, False)


@router.post("/{chat_id}/upload", response_model=dict)
async def send_photo(
    file: UploadFile = File(...),
    chat: ChatsOrm = Depends(get_chat),
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
):
    try:
        url = await service.send_media_message(user=user, file=file, chat=chat)
        return {"url": url}
    except InvalidFileType:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Allowed: jpeg, png, webp, gif, mp4, webm, quicktime, mp3, ogg, wav")
