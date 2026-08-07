import uuid

from sqlalchemy import delete, insert, select, or_, func, update
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError

from src.db.repository import BaseRepository
from .exceptions import UserNotFoundError, UserAlreadyExistsError
from .schemas import CreateUser, UpdateProfileForm
from .models import UsersOrm

SIMILARITY_THRESHOLD = 0.15


def _escape_like(text: str) -> str:
    """Экранирует спецсимволы LIKE. Без этого запрос `%` превращался в
    `ILIKE '%%%'` и совпадал со всеми пользователями сразу — инъекции нет,
    но выгрузить всю базу контактов это позволяло."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class AuthRepository(BaseRepository):

    async def create_user(self, credentials: CreateUser) -> UsersOrm:
        try:
            stmt = insert(UsersOrm).values(credentials.model_dump()).returning(UsersOrm)
            result = await self.session.execute(stmt)
            return result.scalar_one()
        except IntegrityError:
            raise UserAlreadyExistsError()

    async def get_user_by_phone(self, phone_number: str) -> UsersOrm | None:
        stmt = select(UsersOrm).where(UsersOrm.phone_number == phone_number)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_user_by_id(self, user_id: uuid.UUID) -> UsersOrm:
        from src.chats.models import ChatsOrm
        stmt = (
            select(UsersOrm)
            .options(
                selectinload(UsersOrm.chats).selectinload(ChatsOrm.members)
            )
            .where(UsersOrm.id == user_id)
        )
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            raise UserNotFoundError()
        return user

    async def set_key_backup(self, user_id: uuid.UUID, backup: str) -> None:
        stmt = (
            update(UsersOrm)
            .where(UsersOrm.id == user_id, UsersOrm.key_backup.is_(None))
            .values(key_backup=backup)
        )
        await self.session.execute(stmt)

    async def get_key_backup(self, user_id: uuid.UUID) -> str | None:
        stmt = select(UsersOrm.key_backup).where(UsersOrm.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_profile(self, user_id: uuid.UUID, profile_data: UpdateProfileForm) -> None:
        values = profile_data.model_dump(exclude_unset=True)
        if not values:
            return
        stmt = update(UsersOrm).where(UsersOrm.id == user_id).values(values)
        await self.session.execute(stmt)

    async def get_avatar_url(self, user_id: uuid.UUID) -> str | None:
        stmt = select(UsersOrm.image_url).where(UsersOrm.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_avatar(self, user_id: uuid.UUID, image_url: str) -> None:
        stmt = update(UsersOrm).where(UsersOrm.id == user_id).values(image_url=image_url)
        await self.session.execute(stmt)

    async def set_public_key(self, user_id: uuid.UUID, public_key: str) -> None:
        from sqlalchemy import update
        stmt = (
            update(UsersOrm)
            .where(UsersOrm.id == user_id, UsersOrm.public_key.is_(None))
            .values(public_key=public_key)
        )
        await self.session.execute(stmt)

    async def rotate_keys(self, user_id: uuid.UUID, public_key: str, key_backup: str) -> None:
        """Перезаписывает ключевую пару пользователя.

        Обычные set_public_key/set_key_backup пишут только в пустое поле — это
        защита от подмены через API. Но из-за неё скомпрометированный ключ
        нельзя было сменить вообще никак, кроме правки базы руками. Здесь
        перезапись разрешена явно, и вызывающий сервис требует пароль.
        """
        from src.chats.models import ChatKeysOrm
        stmt = (
            update(UsersOrm)
            .where(UsersOrm.id == user_id)
            .values(public_key=public_key, key_backup=key_backup)
        )
        await self.session.execute(stmt)
        # Ключи чатов зашифрованы старым публичным ключом — расшифровать их
        # новым приватным невозможно, строки только мешали бы: пока они есть,
        # участник с ключом чата не может выдать замену (on_conflict_do_nothing).
        await self.session.execute(
            delete(ChatKeysOrm).where(ChatKeysOrm.user_id == user_id)
        )

    async def get_public_key(self, user_id: uuid.UUID) -> str | None:
        stmt = select(UsersOrm.public_key).where(UsersOrm.id == user_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def delete_user(self, user_id: uuid.UUID) -> list[str]:
        """Удаляет пользователя и всё, что на него ссылается.

        Часть связей закрыта ON DELETE CASCADE (участие в чатах и альбомах,
        лайки, закладки, push-токены), но сообщения, комментарии, посты и
        материалы альбомов ссылаются на users без каскада — их нужно убрать
        руками, иначе удаление упрётся во внешний ключ.

        Возвращает ссылки на файлы в хранилище, которые остались без владельца:
        удалять их — задача сервиса, у репозитория нет доступа к S3.
        """
        import json

        from src.albums.models import AlbumMaterialsOrm, AlbumsOrm
        from src.chats.models import ChatKeysOrm, ChatsOrm, MessagesOrm, chat_members
        from src.posts.models import CommentsOrm, PostsOrm

        orphaned: list[str] = []

        user = await self.session.get(UsersOrm, user_id)
        if not user:
            raise UserNotFoundError()
        if user.image_url:
            orphaned.append(user.image_url)

        media = await self.session.execute(
            select(MessagesOrm.text, MessagesOrm.thumbnail_url, MessagesOrm.type)
            .where(MessagesOrm.sender_id == user_id)
        )
        for text, thumbnail, msg_type in media.all():
            if msg_type in ("image", "video", "audio") and text:
                orphaned.append(text)
            if thumbnail:
                orphaned.append(thumbnail)

        materials = await self.session.execute(
            select(AlbumMaterialsOrm.link).where(AlbumMaterialsOrm.published_by_id == user_id)
        )
        orphaned.extend(link for (link,) in materials.all() if link)

        post_materials = await self.session.execute(
            select(PostsOrm.materials).where(PostsOrm.created_by_id == user_id)
        )
        for (raw,) in post_materials.all():
            if not raw:
                continue
            try:
                orphaned.extend(json.loads(raw))
            except (ValueError, TypeError):
                continue

        # Чаты, где после ухода пользователя не останется никого: сначала
        # запоминаем, потом удаляем вместе с историей.
        my_chats = await self.session.execute(
            select(chat_members.c.chat_id).where(chat_members.c.user_id == user_id)
        )
        chat_ids = [row[0] for row in my_chats.all()]

        await self.session.execute(
            delete(AlbumMaterialsOrm).where(AlbumMaterialsOrm.published_by_id == user_id)
        )
        await self.session.execute(delete(AlbumsOrm).where(AlbumsOrm.creator_id == user_id))
        await self.session.execute(delete(CommentsOrm).where(CommentsOrm.created_by_id == user_id))
        await self.session.execute(delete(PostsOrm).where(PostsOrm.created_by_id == user_id))
        await self.session.execute(delete(MessagesOrm).where(MessagesOrm.sender_id == user_id))
        await self.session.execute(delete(ChatKeysOrm).where(ChatKeysOrm.user_id == user_id))
        await self.session.execute(
            delete(chat_members).where(chat_members.c.user_id == user_id)
        )

        for chat_id in chat_ids:
            left = await self.session.execute(
                select(func.count()).select_from(chat_members)
                .where(chat_members.c.chat_id == chat_id)
            )
            if left.scalar_one():
                continue
            await self.session.execute(delete(MessagesOrm).where(MessagesOrm.chat_id == chat_id))
            await self.session.execute(delete(ChatKeysOrm).where(ChatKeysOrm.chat_id == chat_id))
            await self.session.execute(delete(ChatsOrm).where(ChatsOrm.id == chat_id))

        await self.session.execute(delete(UsersOrm).where(UsersOrm.id == user_id))
        return orphaned

    async def search(self, text: str | None, limit: int, offset: int) -> list[UsersOrm]:
        if not text:
            return []

        name_sim = func.similarity(UsersOrm.name, text)
        query = (
            select(UsersOrm)
            .where(
                or_(
                    name_sim > SIMILARITY_THRESHOLD,
                    UsersOrm.phone_number.ilike(f"%{_escape_like(text)}%", escape="\\"),
                )
            )
            .order_by(name_sim.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(query)
        return result.scalars().all()

