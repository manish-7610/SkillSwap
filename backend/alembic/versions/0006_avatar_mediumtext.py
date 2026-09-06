"""Change users.avatar from TEXT to MEDIUMTEXT for 3 MB photo support

Revision ID: 0006_avatar_mediumtext
Revises: 0005_add_deleted_for_everyone
Create Date: 2026-09-05 00:00:00.000000

Why:
    MySQL TEXT has a maximum capacity of 65,535 bytes (64 KB).
    A 3 MB raw image base64-encodes to approximately 4 MB (~4,194,304 bytes),
    which far exceeds TEXT capacity and causes:
        "An internal database error occurred. Please try again."
    when the user attempts to save a large profile photo.

    MEDIUMTEXT supports up to 16,777,215 bytes (~16 MB), which comfortably
    holds a 3 MB image base64 representation (~4 MB encoded).

    No existing data is lost: TEXT rows are valid MEDIUMTEXT rows.
    The SQLAlchemy model continues to use sa.Text() — SQLAlchemy maps both
    TEXT and MEDIUMTEXT to Python str; the actual column type is set by the
    raw DDL executed in this migration.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import MEDIUMTEXT

revision: str = "0006_avatar_mediumtext"
down_revision: Union[str, None] = "0005_add_deleted_for_everyone"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Use raw DDL so the column type is unambiguously MEDIUMTEXT in MySQL.
    # ALTER TABLE ... MODIFY is MySQL-specific but this project targets MySQL.
    op.execute("ALTER TABLE users MODIFY COLUMN avatar MEDIUMTEXT NULL")


def downgrade() -> None:
    # Clear oversized avatars first (>64 KB) to avoid truncation errors.
    op.execute(
        "UPDATE users SET avatar = NULL "
        "WHERE avatar IS NOT NULL AND CHAR_LENGTH(avatar) > 65535"
    )
    op.execute("ALTER TABLE users MODIFY COLUMN avatar TEXT NULL")
