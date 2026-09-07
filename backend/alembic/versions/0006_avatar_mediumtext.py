"""Ensure users.avatar is TEXT (no size limit) for large photo support

Revision ID: 0006_avatar_mediumtext
Revises: 0005_add_deleted_for_everyone
Create Date: 2026-09-05 00:00:00.000000

Original intent (MySQL):
    MySQL TEXT is limited to 65 535 bytes. A 3 MB photo base64-encodes to
    ~4 MB, which overflows TEXT.  The original migration changed the column
    to MEDIUMTEXT (up to 16 MB) using a MySQL-specific ALTER … MODIFY COLUMN.

PostgreSQL behaviour:
    PostgreSQL TEXT has no length limit (stores up to 1 GB).  Migration 0003
    already converted the column from VARCHAR(10) to TEXT using
    op.alter_column(), so the column is already TEXT on PostgreSQL and no
    further DDL is required.

    This migration is therefore a no-op for PostgreSQL: the upgrade() and
    downgrade() functions do nothing, which is safe and intentional.
    The revision chain is preserved so that alembic_version rows written
    against the MySQL database remain valid.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006_avatar_mediumtext"
down_revision: Union[str, None] = "0005_add_deleted_for_everyone"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL TEXT is already unlimited — nothing to do.
    # (The MySQL-specific ALTER TABLE … MODIFY COLUMN MEDIUMTEXT has been
    #  removed because it used sqlalchemy.dialects.mysql and is not valid
    #  PostgreSQL DDL.)
    pass


def downgrade() -> None:
    # Nothing to undo — the column remains TEXT.
    pass
