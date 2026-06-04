from logging.config import fileConfig
from alembic import context
import asyncio

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from src.db.database import Base, async_engine
from src.auth.models import UsersOrm  # noqa: F401
from src.chats.models import ChatsOrm, MessagesOrm, ChatKeysOrm  # noqa: F401
from src.posts.models import PostsOrm, CommentsOrm  # noqa: F401

target_metadata = Base.metadata

EXCLUDE_TABLES = {"push_subscriptions"}


def include_object(object, name, type_, reflected, compare_to):
    if type_ == "table" and name in EXCLUDE_TABLES:
        return False
    return True


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online():
    async with async_engine.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await async_engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
