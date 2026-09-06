"""Initial schema: users, skills, connections

Revision ID: 0001_initial
Revises:
Create Date: 2025-07-21 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("avatar", sa.String(length=10), nullable=True),
        sa.Column("location", sa.String(length=120), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_id",    "users", ["id"],    unique=False)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── skills ────────────────────────────────────────────────────────────────
    op.create_table(
        "skills",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "type",
            sa.Enum("teach", "learn", name="skill_type_enum"),
            nullable=False,
        ),
        sa.Column(
            "category",
            sa.Enum(
                "Technology", "Design", "Music", "Business", "Language", "Other",
                name="skill_category_enum",
            ),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", "type", name="uq_user_skill_type"),
    )
    op.create_index("ix_skills_id",      "skills", ["id"],      unique=False)
    op.create_index("ix_skills_user_id", "skills", ["user_id"], unique=False)

    # ── connections ───────────────────────────────────────────────────────────
    op.create_table(
        "connections",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("sender_id", sa.Integer(), nullable=False),
        sa.Column("receiver_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "accepted", "rejected", name="connection_status_enum"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["sender_id"],   ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["receiver_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sender_id", "receiver_id", name="uq_sender_receiver"),
    )
    op.create_index("ix_connections_id",          "connections", ["id"],          unique=False)
    op.create_index("ix_connections_sender_id",   "connections", ["sender_id"],   unique=False)
    op.create_index("ix_connections_receiver_id", "connections", ["receiver_id"], unique=False)


def downgrade() -> None:
    op.drop_table("connections")
    op.drop_table("skills")
    op.drop_table("users")
    # Drop enums (MySQL ignores this; PostgreSQL needs it)
    op.execute("DROP TYPE IF EXISTS connection_status_enum")
    op.execute("DROP TYPE IF EXISTS skill_category_enum")
    op.execute("DROP TYPE IF EXISTS skill_type_enum")
