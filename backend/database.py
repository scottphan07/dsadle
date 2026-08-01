from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Keep the SQLite file next to this module so it works no matter where
# uvicorn is launched from.
DB_PATH = Path(__file__).resolve().parent / "dsadle.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

# SQLite allows only one thread per connection by default; FastAPI may serve
# a request on a different thread than the one that opened the connection.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
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
