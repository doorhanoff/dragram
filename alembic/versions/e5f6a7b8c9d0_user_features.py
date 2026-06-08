"""user features: is_active, key_backup

Revision ID: e5f6a7b8c9d0
Revises: d84e3dc107e6
Create Date: 2026-05-30 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd84e3dc107e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_active',  sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('key_backup', sa.Text(),    nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'key_backup')
    op.drop_column('users', 'is_active')
