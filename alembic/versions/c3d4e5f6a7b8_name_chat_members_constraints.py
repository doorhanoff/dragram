"""name chat_members constraints

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-29 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Находим и переименовываем безымянные FK через PostgreSQL-специфичный синтаксис
    op.execute("""
        DO $$
        DECLARE
            r RECORD;
        BEGIN
            FOR r IN
                SELECT conname
                FROM pg_constraint
                WHERE conrelid = 'chat_members'::regclass
                  AND contype = 'f'
                  AND conname NOT IN ('fk_chat_members_chat_id', 'fk_chat_members_user_id')
            LOOP
                IF r.conname LIKE '%chat_id%' THEN
                    EXECUTE 'ALTER TABLE chat_members RENAME CONSTRAINT ' || quote_ident(r.conname) || ' TO fk_chat_members_chat_id';
                ELSIF r.conname LIKE '%user_id%' THEN
                    EXECUTE 'ALTER TABLE chat_members RENAME CONSTRAINT ' || quote_ident(r.conname) || ' TO fk_chat_members_user_id';
                END IF;
            END LOOP;
        END $$;
    """)


def downgrade() -> None:
    pass
