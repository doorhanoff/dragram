"""messages.file_name

Имя присланного документа. В хранилище ключ случайный, и без этой колонки
получатель видел бы «a3f9c1…pdf» вместо «Договор.pdf».

Только для type='file'; у фото, видео и голосовых имя не показывается и
остаётся NULL.

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'p6q7r8s9t0u1'
down_revision: Union[str, Sequence[str], None] = 'o5p6q7r8s9t0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('messages', sa.Column('file_name', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'file_name')
