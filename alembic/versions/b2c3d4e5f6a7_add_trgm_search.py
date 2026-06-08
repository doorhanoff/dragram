"""add pg_trgm extension and GIN indexes for user search

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute("CREATE INDEX idx_users_name_trgm ON users USING GIN (name gin_trgm_ops)")
    op.execute("CREATE INDEX idx_users_phone_trgm ON users USING GIN (phone_number gin_trgm_ops)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_users_phone_trgm")
    op.execute("DROP INDEX IF EXISTS idx_users_name_trgm")
