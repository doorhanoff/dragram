"""posts and comments

Revision ID: g7h8i9j0k1l2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'g7h8i9j0k1l2'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'posts',
        sa.Column('id',             sa.Uuid(),        nullable=False),
        sa.Column('title',          sa.String(200),   nullable=False),
        sa.Column('description',    sa.Text(),        nullable=True),
        sa.Column('materials',      sa.Text(),        nullable=True),
        sa.Column('created_by_id',  sa.Uuid(),        nullable=True),
        sa.Column('created_at',     sa.DateTime(),    server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], name='fk_posts_created_by_id'),
        sa.PrimaryKeyConstraint('id', name='pk_posts'),
    )

    op.create_table(
        'comments',
        sa.Column('id',             sa.Uuid(),        nullable=False),
        sa.Column('text',           sa.Text(),        nullable=False),
        sa.Column('materials',      sa.Text(),        nullable=True),
        sa.Column('post_id',        sa.Uuid(),        nullable=False),
        sa.Column('created_by_id',  sa.Uuid(),        nullable=False),
        sa.Column('reply_to_id',    sa.Uuid(),        nullable=True),
        sa.Column('created_at',     sa.DateTime(),    server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['post_id'],       ['posts.id'],    name='fk_comments_post_id',    ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'],   name='fk_comments_created_by'),
        sa.ForeignKeyConstraint(['reply_to_id'],   ['comments.id'], name='fk_comments_reply_to'),
        sa.PrimaryKeyConstraint('id', name='pk_comments'),
    )

    op.create_index('idx_comments_post_id', 'comments', ['post_id'])


def downgrade() -> None:
    op.drop_index('idx_comments_post_id', table_name='comments')
    op.drop_table('comments')
    op.drop_table('posts')
