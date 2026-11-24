from collections.abc import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config.settings import get_settings


class Base(DeclarativeBase):
    pass


_settings = get_settings()
engine_options: dict[str, object] = {"pool_pre_ping": True}
if _settings.database_url.startswith("postgresql"):
    engine_options.update({"pool_size": 20, "max_overflow": 20})
engine = create_engine(_settings.database_url, **engine_options)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    with SessionLocal() as session:
        yield session
