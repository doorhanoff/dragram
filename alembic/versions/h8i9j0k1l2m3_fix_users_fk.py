"""remove wrong fk columns from users

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-06-01 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'h8i9j0k1l2m3'
down_revision: Union[str, Sequence[str], None] = 'g7h8i9j0k1l2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Убираем неправильные FK-колонки которые были на стороне users
    # FK должны быть только на стороне posts/comments
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='users' AND column_name='created_posts_ids') THEN
                ALTER TABLE users DROP COLUMN created_posts_ids;
            END IF;
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name='users' AND column_name='created_comments_ids') THEN
                ALTER TABLE users DROP COLUMN created_comments_ids;
            END IF;
        END $$;
    """)


def downgrade() -> None:
    pass
