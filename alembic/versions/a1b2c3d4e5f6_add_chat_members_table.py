"""add chat_members join table

Revision ID: a1b2c3d4e5f6
Revises: 4d2b45c0fd5f
Create Date: 2026-05-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '4d2b45c0fd5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'chat_members',
        sa.Column('chat_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], name='fk_chat_members_chat_id', ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name='fk_chat_members_user_id', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('chat_id', 'user_id', name='pk_chat_members'),
    )

    # migrate existing data from members_ids array into the join table
    op.execute("""
        INSERT INTO chat_members (chat_id, user_id)
        SELECT id, unnest(members_ids)
        FROM chats
        WHERE members_ids IS NOT NULL
    """)

    op.drop_column('chats', 'members_ids')


def downgrade() -> None:
    op.add_column('chats', sa.Column('members_ids', sa.ARRAY(sa.Uuid()), nullable=True))

    op.execute("""
        UPDATE chats c
        SET members_ids = sub.ids
        FROM (
            SELECT chat_id, array_agg(user_id) AS ids
            FROM chat_members
            GROUP BY chat_id
        ) sub
        WHERE c.id = sub.chat_id
    """)

    op.alter_column('chats', 'members_ids', nullable=False)

    op.drop_table('chat_members')
