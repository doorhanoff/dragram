"""chat_keys table

Revision ID: e6f7a8b9c0d1
Revises: i9j0k1l2m3n4
Create Date: 2026-06-02 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, Sequence[str], None] = 'i9j0k1l2m3n4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'chat_keys',
        sa.Column('chat_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('encrypted_key', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], name='fk_chat_keys_chat_id', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_chat_keys_user_id'),
        sa.PrimaryKeyConstraint('chat_id', 'user_id', name='pk_chat_keys'),
    )


def downgrade() -> None:
    op.drop_table('chat_keys')
