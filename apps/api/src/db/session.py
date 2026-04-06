import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from src.core import get_settings

database_url = get_settings().database_url
if "asyncpg" not in database_url:
    if database_url.startswith("postgres://"):
        database_url = "postgresql+asyncpg://" + database_url[10:]
    else:
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

_use_null_pool = "render.com" in database_url

_pool_kwargs: dict = (
    {"poolclass": NullPool}
    if _use_null_pool
    else {
        "pool_size": 10,
        "max_overflow": 20,
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }
)

engine = create_async_engine(
    database_url,
    echo=os.getenv("SQL_ECHO", "0") == "1",
    connect_args={"server_settings": {"statement_timeout": "30000"}},
    **_pool_kwargs,
)

async_session: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False, autoflush=False
)


class Base(DeclarativeBase):
    pass
