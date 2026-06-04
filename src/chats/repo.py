import uuid
from sqlalchemy import insert, select, update, delete, func
from sqlalchemy.ext.asyncio import AsyncSession
from .models import ChatsOrm, MessagesOrm, ChatKeysOrm, chat_members
from .schemas import CreateChatDb, MessageDbSchema, ChatKeyItem


class ChatsRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, data: CreateChatDb) -> ChatsOrm:
        values = data.model_dump(exclude={"members"})
        stmt = insert(ChatsOrm).values(values).returning(ChatsOrm.id)
        res = await self.session.execute(stmt)
        chat_id = res.scalar_one()

        member_rows = [{"chat_id": chat_id, "user_id": uid} for uid in data.members]
        await self.session.execute(insert(chat_members), member_rows)
        await self.session.commit()

        query = select(ChatsOrm).where(ChatsOrm.id == chat_id)
        result = await self.session.execute(query)
        return result.scalar_one()

    async def get_by_id(self, item_id: uuid.UUID) -> ChatsOrm | None:
        query = select(ChatsOrm).where(ChatsOrm.id == item_id)
        res = await self.session.execute(query)
        return res.scalar_one_or_none()

    async def get_all(self) -> list[ChatsOrm]:
        query = select(ChatsOrm)
        res = await self.session.execute(query)
        return list(res.scalars().all())

    async def update_chat_image(self, chat_id: uuid.UUID, image_url: str) -> ChatsOrm:
        stmt = update(ChatsOrm).where(ChatsOrm.id == chat_id).values(image_url=image_url)
        await self.session.execute(stmt)
        await self.session.commit()
        query = select(ChatsOrm).where(ChatsOrm.id == chat_id)
        result = await self.session.execute(query)
        return result.scalar_one()

    async def get_by_members(self, members: list[uuid.UUID]) -> ChatsOrm | None:
        member_count = len(members)
        subq = (
            select(chat_members.c.chat_id)
            .where(chat_members.c.user_id.in_(members))
            .group_by(chat_members.c.chat_id)
            .having(func.count(chat_members.c.user_id) == member_count)
            .subquery()
        )
        size_subq = (
            select(chat_members.c.chat_id)
            .group_by(chat_members.c.chat_id)
            .having(func.count(chat_members.c.user_id) == member_count)
            .subquery()
        )
        query = (
            select(ChatsOrm)
            .where(ChatsOrm.id.in_(select(subq.c.chat_id)))
            .where(ChatsOrm.id.in_(select(size_subq.c.chat_id)))
        )
        res = await self.session.execute(query)
        return res.scalars().first()

    # ── messages ──────────────────────────────────────────────────────────────

    async def get_messages_paginated(
        self,
        chat_id: uuid.UUID,
        limit: int = 50,
        before_id: uuid.UUID | None = None,
    ) -> list[MessagesOrm]:
        query = (
            select(MessagesOrm)
            .where(MessagesOrm.chat_id == chat_id)
            .order_by(MessagesOrm.created_at.desc())
            .limit(limit)
        )
        if before_id:
            subq = (
                select(MessagesOrm.created_at)
                .where(MessagesOrm.id == before_id)
                .scalar_subquery()
            )
            query = query.where(MessagesOrm.created_at < subq)
        res = await self.session.execute(query)
        return list(reversed(res.scalars().all()))

    async def create_message(self, data: MessageDbSchema) -> MessagesOrm:
        stmt = insert(MessagesOrm).values(data.model_dump()).returning(MessagesOrm)
        res = await self.session.execute(stmt)
        await self.session.commit()
        # reload to get sender relationship
        msg_id = res.scalar_one().id
        result = await self.session.execute(select(MessagesOrm).where(MessagesOrm.id == msg_id))
        return result.scalar_one()

    async def mark_read(self, chat_id: uuid.UUID, reader_id: uuid.UUID) -> list[uuid.UUID]:
        """Помечает все чужие непрочитанные сообщения как прочитанные. Возвращает список ID."""
        stmt = (
            update(MessagesOrm)
            .where(
                MessagesOrm.chat_id == chat_id,
                MessagesOrm.sender_id != reader_id,
                MessagesOrm.is_read == False,
            )
            .values(is_read=True)
            .returning(MessagesOrm.id)
        )
        res = await self.session.execute(stmt)
        await self.session.commit()
        return [row[0] for row in res.fetchall()]

    async def get_message(self, message_id: uuid.UUID) -> MessagesOrm | None:
        res = await self.session.execute(select(MessagesOrm).where(MessagesOrm.id == message_id))
        return res.scalar_one_or_none()

    async def delete_message(self, message_id: uuid.UUID, sender_id: uuid.UUID) -> MessagesOrm | None:
        """Удаляет сообщение. Только отправитель может удалить. Возвращает удалённое сообщение или None."""
        stmt = (
            delete(MessagesOrm)
            .where(MessagesOrm.id == message_id, MessagesOrm.sender_id == sender_id)
            .returning(MessagesOrm)
        )
        res = await self.session.execute(stmt)
        await self.session.commit()
        return res.scalar_one_or_none()

    # ── keys ──────────────────────────────────────────────────────────────────

    async def set_chat_keys(self, chat_id: uuid.UUID, keys: list[ChatKeyItem]) -> None:
        from sqlalchemy.dialects.postgresql import insert as pg_insert
        rows = [{"chat_id": chat_id, "user_id": k.user_id, "encrypted_key": k.encrypted_key} for k in keys]
        stmt = pg_insert(ChatKeysOrm).values(rows)
        stmt = stmt.on_conflict_do_nothing(index_elements=["chat_id", "user_id"])
        await self.session.execute(stmt)
        await self.session.commit()

    async def get_my_chat_key(self, chat_id: uuid.UUID, user_id: uuid.UUID) -> ChatKeysOrm | None:
        query = select(ChatKeysOrm).where(
            ChatKeysOrm.chat_id == chat_id,
            ChatKeysOrm.user_id == user_id,
        )
        res = await self.session.execute(query)
        return res.scalar_one_or_none()
