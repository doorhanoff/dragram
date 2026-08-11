import uuid
import asyncio
import json

from fastapi import (
    APIRouter, Depends, UploadFile, HTTPException, Query, status, File,
    WebSocket, WebSocketDisconnect, WebSocketException,
)
from redis.asyncio import Redis

from .depends import (
    get_chats_service, get_chat, ws_get_chat,
    ChatsServiceFactory, get_chats_service_factory,
)
from .exceptions import ChatNotFound, NotChatMember, InvalidFileType, KeyTargetNotMember
from src.core.rate_limit import make_rate_limiter
from .models import ChatsOrm
from .schemas import (
    CreateChat, ChatsResponse, MessagesResponse,
    WSSendMessage, SetChatKeys, ForwardMessage, AddChatMembers,
)
from .service import ChatsService
from src.auth.depends import get_current_user, ws_get_current_user
from src.redis.depends import get_redis_client
from ..auth.models import UsersOrm

router = APIRouter(prefix="/chats", tags=["chats"])

# Штатное закрытие (клиент прислал close-фрейм) приходит как WebSocketDisconnect,
# а неаккуратный обрыв — пропала мобильная сеть, заснул телефон, забился буфер —
# прилетает из websockets как ConnectionClosedError мимо starlette. Ловим оба,
# иначе TaskGroup печатает в лог полный traceback на каждый такой обрыв.
DISCONNECT_ERRORS: tuple[type[BaseException], ...] = (WebSocketDisconnect,)
try:
    from websockets.exceptions import ConnectionClosed
except ImportError:  # сервер поднят без websockets (например, на wsproto)
    pass
else:
    DISCONNECT_ERRORS += (ConnectionClosed,)


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



@router.post("/{chat_id}/members", response_model=ChatsResponse,
             dependencies=[Depends(make_rate_limiter(max_requests=20, window=60))])
async def add_members(
    chat_id: uuid.UUID,
    body: AddChatMembers,
    service: ChatsService = Depends(get_chats_service),
    user: UsersOrm = Depends(get_current_user),
):
    """Добавляет людей в группу. Ключ чата новичкам выдаёт не сервер — у него
    его нет, — а любой клиент, у которого он уже есть (см. /keys/missing)."""
    return await service.add_members(chat_id, body.user_ids, user)


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
    # Верхняя граница обязательна: ?limit=1000000 иначе поднимает всю историю
    # чата в память приложения и Postgres разом.
    limit: int = Query(50, ge=1, le=100),
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



@router.get("/{chat_id}/keys/missing", response_model=list[uuid.UUID])
async def get_members_without_keys(
    chat_id: uuid.UUID,
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
):
    """Кому из участников ещё не выдан ключ чата. Клиент, у которого ключ есть,
    зашифрует его их публичными ключами и выложит через /keys — так участник,
    сменивший ключевую пару, снова получает доступ к групповому чату."""
    return await service.get_members_without_keys(chat_id, user)


@router.get("/{chat_id}/keys/me")
async def get_my_chat_key(
    chat_id: uuid.UUID,
    user: UsersOrm = Depends(get_current_user),
    service: ChatsService = Depends(get_chats_service),
):

    key = await service.get_my_chat_key(chat_id, user)
    if key is None:
        # Штатная ситуация: участника добавили, а set_chat_keys для него ещё
        # не вызывали — как и для key-backup/public-key в auth, это 404.
        raise HTTPException(status_code=404, detail="Chat key not found")
    return {"encrypted_key": key.encrypted_key}


@router.websocket("/ws/{chat_id}",
                   dependencies=[Depends(make_rate_limiter(max_requests=40, window=60))])
async def chat_websocket(
    ws: WebSocket,
    chat_id: uuid.UUID,
    make_service: ChatsServiceFactory = Depends(get_chats_service_factory),
    user: UsersOrm = Depends(ws_get_current_user),
    chat: ChatsOrm = Depends(ws_get_chat),
):

    await ws.accept()

    async with make_service.pubsub(chat_id) as conn:
        async def write_messages():
            # iter_text, а не iter_json: невалидный JSON иначе поднимает
            # исключение прямо из итератора и рвёт соединение — клиент,
            # приславший мусор, ронял себе чат вместо получения ошибки.
            async for raw in ws.iter_text():
                try:
                    event = json.loads(raw)
                except ValueError:
                    await ws.send_json({"event": "error", "detail": "Malformed JSON"})
                    continue
                # Сессия БД берётся из пула на время обработки одного события
                # и сразу возвращается: открытый чат не должен занимать коннект.
                async with make_service() as service:
                    try:
                        await service.handle_incoming_event(event, chat, user)
                    except HTTPException as exc:
                        await ws.send_json({
                            "event": "error",
                            "status": exc.status_code,
                            "detail": exc.detail,
                        })
        async def broadcast_messages():
            async for message in conn.listen():
                await ws.send_json(message)

        try:
            async with asyncio.TaskGroup() as tg:
                tg.create_task(write_messages())
                tg.create_task(broadcast_messages())
        except* DISCONNECT_ERRORS:
            pass



@router.post("/{chat_id}/forward", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(make_rate_limiter(max_requests=40, window=60))])
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Такой файл отправить нельзя. Можно фото, видео, звук, "
                   "а также pdf, документы Word и Excel, txt и zip.",
        )
