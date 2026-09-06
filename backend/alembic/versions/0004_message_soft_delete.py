"""Add per-user soft-delete flags to messages table

Revision ID: 0004_message_soft_delete
Revises: 0003_widen_avatar
Create Date: 2026-09-05 00:00:00.000000

Why two boolean columns instead of a separate visibility table:
    Messages always have exactly two parties (sender + receiver).
    Two boolean flags on the existing row satisfy per-user deletion
    with zero extra joins on every history query.
    A separate table would be needed only for group/multi-party messages.

deleted_for_sender   — True when the sender has deleted this message
                       for themselves, OR when either party deletes it
                       for everyone.
deleted_for_receiver — True when the receiver has deleted this message
                       for themselves, OR when either party deletes it
                       for everyone.

Existing rows default to False / False — no data loss, no behaviour change.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004_message_soft_delete"
down_revision: Union[str, None] = "0003_widen_avatar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column(
            "deleted_for_sender",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "messages",
        sa.Column(
            "deleted_for_receiver",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("messages", "deleted_for_receiver")
    op.drop_column("messages", "deleted_for_sender")
