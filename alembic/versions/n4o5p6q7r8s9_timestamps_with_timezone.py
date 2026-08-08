"""timestamps with time zone

Даты хранились как `timestamp without time zone`. Значения в них — UTC
(`func.now()` при часовом поясе базы UTC), но сама колонка про это не знала,
и наружу они уходили строкой без смещения: «2026-08-08T15:19:18».

Браузер такую строку считает МЕСТНЫМ временем, поэтому в Москве сообщение
показывалось на три часа раньше, чем было отправлено.

Переводим колонки в `timestamptz`. `USING ... AT TIME ZONE 'UTC'` обязателен:
без него Postgres истолкует существующие значения по своему текущему поясу,
и старые даты уедут. Пояс базы сейчас UTC, так что явное указание ничего не
меняет, но защищает от переезда на сервер с другим поясом.

Revision ID: n4o5p6q7r8s9
Revises: m3n4o5p6q7r8
Create Date: 2026-08-08 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'n4o5p6q7r8s9'
down_revision: Union[str, Sequence[str], None] = 'm3n4o5p6q7r8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (таблица, колонка)
COLUMNS = [
    ("messages", "created_at"),
    ("chats", "created_at"),
    ("posts", "created_at"),
    ("comments", "created_at"),
    ("albums", "created_at"),
    ("album_materials", "published_at"),
    ("device_tokens", "created_at"),
]


def upgrade() -> None:
    for table, column in COLUMNS:
        op.alter_column(
            table, column,
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_server_default=sa.text("now()"),
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )


def downgrade() -> None:
    for table, column in COLUMNS:
        op.alter_column(
            table, column,
            type_=sa.DateTime(),
            existing_type=sa.DateTime(timezone=True),
            existing_server_default=sa.text("now()"),
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )
