"""Load seed_data.json into the SQLite database. Safe to re-run: does nothing
if the questions table already has rows."""

import json
from pathlib import Path

from database import Base, SessionLocal, engine
from models import Question

SEED_FILE = Path(__file__).resolve().parent / "seed_data.json"


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        existing = db.query(Question).count()
        if existing > 0:
            print(f"Database already has {existing} questions — skipping seed.")
            return
        rows = json.loads(SEED_FILE.read_text())
        db.add_all(Question(**row) for row in rows)
        db.commit()
        print(f"Seeded {len(rows)} questions.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
