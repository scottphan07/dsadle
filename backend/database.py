import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# The SQLite file sits next to this module so the path resolves the same no
# matter where uvicorn is launched from. DSADLE_DB_PATH relocates it.
DB_PATH = Path(os.environ.get("DSADLE_DB_PATH") or Path(__file__).resolve().parent / "dsadle.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# DATABASE_URL overrides everything — the no-code-change escape hatch to Postgres.
DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{DB_PATH}"

# SQLite pins a connection to its creating thread; FastAPI may serve the request
# on another. Gated on the driver: other drivers reject the unknown kwarg.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: one database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
