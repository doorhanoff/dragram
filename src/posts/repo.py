import uuid
import json
from sqlalchemy import insert, select, update, delete, or_, func, exists
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from .models import PostsOrm, CommentsOrm, post_likes, post_bookmarks
from .schemas import CreatePost, CreateComment


class PostsRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, data: CreatePost, user_id: uuid.UUID) -> PostsOrm:
        stmt = (
            insert(PostsOrm)
            .values({**data.model_dump(), "created_by_id": user_id})
            .returning(PostsOrm)
        )
        res = await self.session.execute(stmt)
        await self.session.commit()
        return res.scalar_one()

    async def get_by_id(self, item_id: uuid.UUID) -> PostsOrm | None:
        query = select(PostsOrm).where(PostsOrm.id == item_id)
        res = await self.session.execute(query)
        return res.scalar_one_or_none()

    async def get_by_id_with_author(self, item_id: uuid.UUID) -> PostsOrm | None:
        query = (
            select(PostsOrm)
            .options(selectinload(PostsOrm.created_by))
            .where(PostsOrm.id == item_id)
        )
        res = await self.session.execute(query)
        return res.scalar_one_or_none()

    async def search(
        self,
        text: str | None,
        limit: int,
        offset: int,
        filter_: str = "all",
        user_id: uuid.UUID | None = None,
    ) -> list[dict]:
        """Возвращает посты с likes_count, is_liked, is_bookmarked."""
        likes_count_sq = (
            select(func.count())
            .where(post_likes.c.post_id == PostsOrm.id)
            .correlate(PostsOrm)
            .scalar_subquery()
        )
        is_liked_sq = (
            select(func.count())
            .where(
                post_likes.c.post_id == PostsOrm.id,
                post_likes.c.user_id == user_id,
            )
            .correlate(PostsOrm)
            .scalar_subquery()
        ) if user_id else None

        is_bm_sq = (
            select(func.count())
            .where(
                post_bookmarks.c.post_id == PostsOrm.id,
                post_bookmarks.c.user_id == user_id,
            )
            .correlate(PostsOrm)
            .scalar_subquery()
        ) if user_id else None

        query = select(PostsOrm).options(selectinload(PostsOrm.created_by))

        if text:
            pattern = f"%{text}%"
            query = query.where(or_(PostsOrm.title.ilike(pattern), PostsOrm.description.ilike(pattern)))

        if filter_ == "saved" and user_id:
            query = query.where(
                exists().where(
                    post_bookmarks.c.post_id == PostsOrm.id,
                    post_bookmarks.c.user_id == user_id,
                )
            )
        elif filter_ == "friends" and user_id:
            # "Друзья" = пользователи с которыми есть личный чат
            from src.chats.models import chat_members as cm
            friends_sq = (
                select(cm.c.user_id)
                .where(cm.c.chat_id.in_(
                    select(cm.c.chat_id).where(cm.c.user_id == user_id)
                ))
                .where(cm.c.user_id != user_id)
            )
            query = query.where(PostsOrm.created_by_id.in_(friends_sq))

        query = query.order_by(PostsOrm.created_at.desc()).limit(limit).offset(offset)
        res = await self.session.execute(query)
        posts = list(res.scalars().all())

        # Получаем счётчики одним запросом
        if posts:
            post_ids = [p.id for p in posts]
            lc_res = await self.session.execute(
                select(post_likes.c.post_id, func.count().label("cnt"))
                .where(post_likes.c.post_id.in_(post_ids))
                .group_by(post_likes.c.post_id)
            )
            likes_map = {row.post_id: row.cnt for row in lc_res}

            liked_set: set = set()
            bm_set: set = set()
            if user_id:
                liked_res = await self.session.execute(
                    select(post_likes.c.post_id)
                    .where(post_likes.c.post_id.in_(post_ids), post_likes.c.user_id == user_id)
                )
                liked_set = {row.post_id for row in liked_res}
                bm_res = await self.session.execute(
                    select(post_bookmarks.c.post_id)
                    .where(post_bookmarks.c.post_id.in_(post_ids), post_bookmarks.c.user_id == user_id)
                )
                bm_set = {row.post_id for row in bm_res}

            result = []
            for p in posts:
                result.append({
                    "orm": p,
                    "likes_count":   likes_map.get(p.id, 0),
                    "is_liked":      p.id in liked_set,
                    "is_bookmarked": p.id in bm_set,
                })
            return result

        return []

    # ── Лайки / закладки ──────────────────────────────────────────────────────

    async def toggle_like(self, post_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """True = поставил лайк, False = убрал."""
        existing = await self.session.execute(
            select(post_likes).where(
                post_likes.c.post_id == post_id,
                post_likes.c.user_id == user_id,
            )
        )
        if existing.first():
            await self.session.execute(
                delete(post_likes).where(
                    post_likes.c.post_id == post_id,
                    post_likes.c.user_id == user_id,
                )
            )
            await self.session.commit()
            return False
        await self.session.execute(
            insert(post_likes).values(post_id=post_id, user_id=user_id)
        )
        await self.session.commit()
        return True

    async def toggle_bookmark(self, post_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """True = добавил в закладки, False = убрал."""
        existing = await self.session.execute(
            select(post_bookmarks).where(
                post_bookmarks.c.post_id == post_id,
                post_bookmarks.c.user_id == user_id,
            )
        )
        if existing.first():
            await self.session.execute(
                delete(post_bookmarks).where(
                    post_bookmarks.c.post_id == post_id,
                    post_bookmarks.c.user_id == user_id,
                )
            )
            await self.session.commit()
            return False
        await self.session.execute(
            insert(post_bookmarks).values(post_id=post_id, user_id=user_id)
        )
        await self.session.commit()
        return True

    # ── Комментарии ───────────────────────────────────────────────────────────

    async def create_comment(self, data: CreateComment, post_id: uuid.UUID, user_id: uuid.UUID) -> CommentsOrm:
        stmt = (
            insert(CommentsOrm)
            .values(
                text=data.text,
                post_id=post_id,
                created_by_id=user_id,
                reply_to_id=data.reply_to_id,
            )
            .returning(CommentsOrm)
        )
        res = await self.session.execute(stmt)
        await self.session.commit()
        comment_id = res.scalar_one().id
        # Перезагружаем с автором и цитируемым комментарием (с его автором)
        result = await self.session.execute(
            select(CommentsOrm)
            .options(
                selectinload(CommentsOrm.created_by),
                selectinload(CommentsOrm.reply_to).selectinload(CommentsOrm.created_by),
            )
            .where(CommentsOrm.id == comment_id)
        )
        return result.scalar_one()

    async def get_comments(self, post_id: uuid.UUID, limit: int, offset: int) -> list[CommentsOrm]:
        query = (
            select(CommentsOrm)
            .options(
                selectinload(CommentsOrm.created_by),
                selectinload(CommentsOrm.reply_to).selectinload(CommentsOrm.created_by),
            )
            .where(CommentsOrm.post_id == post_id)
            .order_by(CommentsOrm.created_at.asc())
            .limit(limit).offset(offset)
        )
        res = await self.session.execute(query)
        return list(res.scalars().all())

    async def delete_comment(self, comment_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        from sqlalchemy import delete as sa_delete
        stmt = (
            sa_delete(CommentsOrm)
            .where(CommentsOrm.id == comment_id, CommentsOrm.created_by_id == user_id)
            .returning(CommentsOrm.id)
        )
        res = await self.session.execute(stmt)
        await self.session.commit()
        return res.scalar_one_or_none() is not None

    async def add_media(self, post_id: uuid.UUID, urls: list[str]) -> PostsOrm:
        """Добавляет список URL медиафайлов в materials поста."""
        post = await self.get_by_id(post_id)
        try:
            current = json.loads(post.materials) if post.materials else []
        except (TypeError, ValueError):
            current = []
        current.extend(urls)
        stmt = (
            update(PostsOrm)
            .where(PostsOrm.id == post_id)
            .values(materials=json.dumps(current))
            .returning(PostsOrm)
        )
        res = await self.session.execute(stmt)
        await self.session.commit()
        return res.scalar_one()

    async def get_all(self) -> list[PostsOrm]:
        query = select(PostsOrm)
        res = await self.session.execute(query)
        return list(res.scalars().all())
