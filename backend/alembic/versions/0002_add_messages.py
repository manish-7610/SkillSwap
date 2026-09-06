"""Add messages table

Revision ID: 0002_add_messages
Revises: 0001_initial
Create Date: 2026-09-04 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002_add_messages"
down_revision: Union[str, None] = "0001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── messages ──────────────────────────────────────────────────────────────
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sender_id", sa.Integer(), nullable=False),
        sa.Column("receiver_id", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["sender_id"], ["users.id"],
            name="fk_messages_sender_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["receiver_id"], ["users.id"],
            name="fk_messages_receiver_id",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # ── Individual column indexes ─────────────────────────────────────────────
    op.create_index("ix_messages_id",          "messages", ["id"],          unique=False)
    op.create_index("ix_messages_sender_id",   "messages", ["sender_id"],   unique=False)
    op.create_index("ix_messages_receiver_id", "messages", ["receiver_id"], unique=False)

    # ── Composite index for efficient conversation history queries ────────────
    # Covers: WHERE (sender_id=A AND receiver_id=B) OR (sender_id=B AND receiver_id=A)
    # ORDER BY created_at DESC  with optional LIMIT / cursor pagination.
    op.create_index(
        "ix_messages_conversation",
        "messages",
        ["sender_id", "receiver_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_messages_conversation", table_name="messages")
    op.drop_index("ix_messages_receiver_id",  table_name="messages")
    op.drop_index("ix_messages_sender_id",    table_name="messages")
    op.drop_index("ix_messages_id",           table_name="messages")
    op.drop_table("messages")
