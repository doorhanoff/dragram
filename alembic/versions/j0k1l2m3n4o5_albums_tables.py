"""albums tables

Revision ID: j0k1l2m3n4o5
Revises: e6f7a8b9c0d1
Create Date: 2026-06-10 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'j0k1l2m3n4o5'
down_revision: Union[str, Sequence[str], None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'albums',
        sa.Column('id',          sa.Uuid(),     nullable=False),
        sa.Column('name',        sa.String(50), nullable=False),
        sa.Column('creator_id',  sa.Uuid(),     nullable=False),
        sa.Column('created_at',  sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['creator_id'], ['users.id'], name='fk_albums_creator_id'),
        sa.PrimaryKeyConstraint('id', name='pk_albums'),
    )

    op.create_table(
        'album_members',
        sa.Column('album_id', sa.Uuid(), nullable=False),
        sa.Column('user_id',  sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['album_id'], ['albums.id'], ondelete='CASCADE', name='fk_album_members_album_id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE', name='fk_album_members_user_id'),
        sa.PrimaryKeyConstraint('album_id', 'user_id', name='pk_album_members'),
    )

    op.create_table(
        'album_materials',
        sa.Column('id',               sa.Uuid(),     nullable=False),
        sa.Column('link',              sa.Text(),     nullable=False),
        sa.Column('album_id',          sa.Uuid(),     nullable=False),
        sa.Column('published_by_id',   sa.Uuid(),     nullable=False),
        sa.Column('published_at',      sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['album_id'], ['albums.id'], ondelete='CASCADE', name='fk_album_materials_album_id'),
        sa.ForeignKeyConstraint(['published_by_id'], ['users.id'], name='fk_album_materials_published_by'),
        sa.PrimaryKeyConstraint('id', name='pk_album_materials'),
    )

    op.create_index('idx_album_materials_album_id', 'album_materials', ['album_id'])


def downgrade() -> None:
    op.drop_index('idx_album_materials_album_id', table_name='album_materials')
    op.drop_table('album_materials')
    op.drop_table('album_members')
    op.drop_table('albums')
