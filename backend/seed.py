"""Load seed_data.json into the SQLite database.

    python seed.py              # first run only: does nothing if rows exist
    python seed.py --check      # validate and report, never opens the database
    python seed.py --dry-run    # do the replace in a transaction, then roll back
    python seed.py --replace    # swap the whole bank for the file's contents

seed_data.json is the source of truth: --replace makes the database disposable so
a deploy can re-seed on boot, and discards anything created through the admin API.

Validation always runs first (see validate_seed.py); errors abort before any
write.
"""

import argparse
import sys
from pathlib import Path

from sqlalchemy import delete

from database import Base, SessionLocal, engine
from models import Question
from validate_seed import SEED_FILE, load_and_validate


def _rows_or_exit(path: Path) -> list[Question]:
    """Validate the file and turn it into unsaved Question objects, or exit 1."""
    report = load_and_validate(path)
    print(f"{path.name}:")
    print(report.render())
    if not report.ok:
        sys.exit(1)
    # Pydantic has already coerced puzzle_date from ISO string to date, so these
    # rows go straight to SQLAlchemy.
    return [Question(**row.model_dump()) for row in report.rows]


def seed(path: Path = SEED_FILE, replace: bool = False, dry_run: bool = False) -> None:
    Base.metadata.create_all(bind=engine)
    questions = _rows_or_exit(path)

    db = SessionLocal()
    try:
        existing = db.query(Question).count()

        if existing and not (replace or dry_run):
            print(f"\nDatabase already has {existing} question(s) — skipping seed.")
            print("Use --replace to swap them for the file's contents.")
            return

        if existing:
            print(f"\nReplacing {existing} existing question(s) with {len(questions)} from {path.name}")
            before = {name for (name,) in db.query(Question.name).all()}
        else:
            before = set()

        # Delete and insert in ONE transaction: the old rows are gone before the
        # new ones insert, so reused names or dates can't trip the unique
        # indexes, and a crash rolls back to the old bank rather than no bank.
        db.execute(delete(Question))
        db.add_all(questions)

        if dry_run:
            db.flush()  # surfaces constraint violations without committing
            db.rollback()
            after = {q.name for q in questions}
            print(f"\n[dry run] would insert {len(questions)}, rolled back. No changes written.")
            for name in sorted(before - after):
                print(f"  - {name}")
            for name in sorted(after - before):
                print(f"  + {name}")
            return

        db.commit()
        print(f"\nSeeded {len(questions)} question(s).")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="validate only; never touches the database")
    ap.add_argument("--replace", action="store_true", help="replace the entire question bank")
    ap.add_argument("--dry-run", action="store_true", help="run the replace in a transaction, then roll back")
    ap.add_argument("path", nargs="?", type=Path, default=SEED_FILE, help="seed file (default: seed_data.json)")
    args = ap.parse_args()

    if args.check:
        report = load_and_validate(args.path)
        print(f"{args.path.name}:")
        print(report.render())
        sys.exit(0 if report.ok else 1)

    seed(args.path, replace=args.replace, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
