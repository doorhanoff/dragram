"""messages.reply_to_id

Ответ на конкретное сообщение. Наружу уезжает только идентификатор: текст
цитаты остаётся тем же зашифрованным блобом, что и исходное сообщение, и
сервер по-прежнему не знает, на что именно отвечают.

ondelete='SET NULL': удаление процитированного сообщения не должно уносить с
собой все ответы на него — в переписке остались бы дыры.

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'o5p6q7r8s9t0'
down_revision: Union[str, Sequence[str], None] = 'n4o5p6q7r8s9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('messages', sa.Column('reply_to_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_messages_reply_to_id', 'messages', 'messages',
        ['reply_to_id'], ['id'], ondelete='SET NULL',
    )
    # Индекс нужен самому SET NULL: без него удаление сообщения заставляет
    # Postgres просматривать всю таблицу в поисках ссылающихся строк.
    op.create_index('ix_messages_reply_to_id', 'messages', ['reply_to_id'])


def downgrade() -> None:
    op.drop_index('ix_messages_reply_to_id', table_name='messages')
    op.drop_constraint('fk_messages_reply_to_id', 'messages', type_='foreignkey')
    op.drop_column('messages', 'reply_to_id')
