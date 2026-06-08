"""users_public_keys

Revision ID: d84e3dc107e6
Revises: b2c3d4e5f6a7
Create Date: 2026-05-29 20:27:09.599462

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd84e3dc107e6'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('public_key', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'public_key')
