import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool, create_engine
from alembic import context

# ── Make sure `app` package is importable ───────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ── Import settings & all models so Alembic sees the metadata ───────────────
from app.core.config import settings  # noqa: E402
from app.models.base import Base  # noqa: E402
from app.models import User, Skill, Connection, Message  # noqa: F401, E402

# ── Alembic config object ────────────────────────────────────────────────────
config = context.config

# Override sqlalchemy.url from our settings so .env is the single source.
# configparser uses % for interpolation, so percent-encode any literal %
# in the URL (e.g. %40 → %%40) before storing it in the ini section.
# The URL is also stored on config.attributes so the online runner can
# retrieve it directly without going through configparser at all.
_db_url = settings.DATABASE_URL.replace("%", "%%")
config.set_main_option("sqlalchemy.url", _db_url)
config.attributes["sqlalchemy.url"] = settings.DATABASE_URL  # unescaped

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


# ── Offline migrations ───────────────────────────────────────────────────────
def run_migrations_offline() -> None:
    # Prefer the unescaped URL stored in config.attributes; fall back to the
    # configparser value (which has %% escaped back to %).
    url = config.attributes.get("sqlalchemy.url") or config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online migrations ─────────────────────────────────────────────────────────
def run_migrations_online() -> None:
    # Use the URL stored directly on config.attributes to avoid configparser
    # percent-interpolation issues with URL-encoded characters (e.g. %40, %23).
    url = config.attributes.get("sqlalchemy.url") or config.get_main_option("sqlalchemy.url")
    connectable = create_engine(url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
