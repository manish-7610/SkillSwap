"""Add explicit deleted_for_everyone column to messages table

Revision ID: 0005_add_deleted_for_everyone
Revises: 0004_message_soft_delete
Create Date: 2026-09-05 00:00:00.000000

Why this migration is needed:
    Migration 0004 added deleted_for_sender and deleted_for_receiver.
    The original design inferred "deleted for everyone" when BOTH flags were True.
    However, two independent "delete for me" actions (one from each party) also
    produce both=True, creating an ambiguous state:
        - Sender deletes for themselves  → dfs=True, dfr=False
        - Receiver then deletes for themselves → dfs=True, dfr=True
    This was incorrectly treated as "deleted for everyone", showing a placeholder
    to both users instead of hiding the row for each party individually.

    The fix: introduce a dedicated deleted_for_everyone boolean column that is
    set ONLY by the original sender's explicit "delete for everyone" action.

    Semantics after this migration:
        deleted_for_sender   True → hide row from sender's GET history
        deleted_for_receiver True → hide row from receiver's GET history
        deleted_for_everyone True → show placeholder to BOTH (content redacted)

    These are now orthogonal. Two independent "for me" deletions result in
        dfs=True, dfr=True, dfe=False  → both just see nothing (row excluded)
    A "for everyone" action results in
        dfs=True, dfr=True, dfe=True   → both see placeholder bubble
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0005_add_deleted_for_everyone"
down_revision: Union[str, None] = "0004_message_soft_delete"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column(
            "deleted_for_everyone",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("messages", "deleted_for_everyone")
