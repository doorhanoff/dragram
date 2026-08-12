"""users.last_seen

Когда человека видели последний раз. Оперативная отметка живёт в Redis, сюда
она переписывается раз в десять минут — чтобы пережить его перезапуск: иначе
у всех разом пропадает «был вчера в 21:40» и остаётся глухое «не в сети».

Колонка пустая для тех, кто не заходил после этой правки: у них строка
появится с первым же входом.

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'q7r8s9t0u1v2'
down_revision: Union[str, Sequence[str], None] = 'p6q7r8s9t0u1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('last_seen', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'last_seen')
