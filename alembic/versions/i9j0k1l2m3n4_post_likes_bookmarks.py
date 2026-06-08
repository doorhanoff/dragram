"""post likes and bookmarks

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-06-02 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'i9j0k1l2m3n4'
down_revision: Union[str, Sequence[str], None] = 'h8i9j0k1l2m3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'post_likes',
        sa.Column('post_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE', name='fk_post_likes_post_id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE', name='fk_post_likes_user_id'),
        sa.PrimaryKeyConstraint('post_id', 'user_id', name='pk_post_likes'),
    )
    op.create_table(
        'post_bookmarks',
        sa.Column('post_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['post_id'], ['posts.id'], ondelete='CASCADE', name='fk_post_bookmarks_post_id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE', name='fk_post_bookmarks_user_id'),
        sa.PrimaryKeyConstraint('post_id', 'user_id', name='pk_post_bookmarks'),
    )


def downgrade() -> None:
    op.drop_table('post_bookmarks')
    op.drop_table('post_likes')
