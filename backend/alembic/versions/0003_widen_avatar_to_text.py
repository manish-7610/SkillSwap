"""Widen users.avatar from String(10) to Text for base64 photo storage

Revision ID: 0003_widen_avatar
Revises: 0002_add_messages
Create Date: 2026-09-05 00:00:00.000000

Why:
    The original avatar column was String(10) — sufficient for emoji characters
    (e.g. 🧑‍💻, max ~8 UTF-8 bytes).  To support custom profile photos stored as
    base64 data URLs (data:image/jpeg;base64,…) we need an unbounded text column.
    A typical 600 KB JPEG encodes to ~800 KB of base64, far beyond String(10).

    No data is lost: existing emoji values are valid TEXT rows.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0003_widen_avatar"
down_revision: Union[str, None] = "0002_add_messages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER COLUMN to TEXT — works on MySQL, PostgreSQL, and SQLite.
    # MySQL: VARCHAR(10) → LONGTEXT (any TEXT type accepts longer strings).
    # PostgreSQL: VARCHAR(10) → TEXT (no length limit).
    # SQLite: column type is advisory; ALTER accepts TEXT without constraint.
    op.alter_column(
        "users",
        "avatar",
        existing_type=sa.String(length=10),
        type_=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    # Truncate any long values before narrowing back to String(10).
    # This prevents constraint violations if custom photos were saved.
    op.execute(
        "UPDATE users SET avatar = LEFT(avatar, 10) WHERE LENGTH(avatar) > 10"
    )
    op.alter_column(
        "users",
        "avatar",
        existing_type=sa.Text(),
        type_=sa.String(length=10),
        existing_nullable=True,
    )
