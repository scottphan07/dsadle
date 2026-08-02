import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Default: keep the SQLite file next to this module so it works no matter where
# uvicorn is launched from. DSADLE_DB_PATH points it at a mounted volume in
# production (e.g. /var/data/dsadle.db), since a path inside the app directory
# is wiped on every redeploy on most hosts.
DB_PATH = Path(os.environ.get("DSADLE_DB_PATH") or Path(__file__).resolve().parent / "dsadle.db")
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

# DATABASE_URL overrides everything — the escape hatch to Postgres later,
# without a code change.
DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{DB_PATH}"

# SQLite allows only one thread per connection by default; FastAPI may serve
# a request on a different thread than the one that opened the connection.
# Gated on the driver, or a Postgres URL would crash on an unknown kwarg.
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
