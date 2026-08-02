"""Add the `puzzle_date` column to `questions` and backfill a schedule.

Before this change the daily answer was `questions[day_idx % count]`, so the
puzzle for any given date depended on the row count — adding or deleting a
question silently reshuffled every past day. Now each row stores the date it is
the puzzle for.

`Base.metadata.create_all()` only ever creates missing tables, never alters an
existing one, so an already-seeded `dsadle.db` needs this one-off script.

Safe to re-run: the column, the index, and the backfill are each guarded.
Uses stdlib sqlite3 only, so it can run against the tree before or after the
model change.
"""

import sqlite3
from datetime import date, timedelta
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "dsadle.db"

# The last day of the backfilled run. Hardcoded rather than `date.today()` so
# re-running the script months later reproduces the same schedule instead of
# sliding it forward. With 27 questions this puts day one on 2026-07-06.
BACKFILL_END = date(2026, 8, 1)

# SQLAlchemy emits this exact name for `unique=True, index=True` (compare the
# existing ix_questions_name), so a migrated DB matches a freshly-created one.
INDEX_NAME = "ix_questions_puzzle_date"


def _has_column(conn: sqlite3.Connection, table: str, column: str) -> bool:
    return any(row[1] == column for row in conn.execute(f"PRAGMA table_info({table})"))


def migrate() -> None:
    if not DB_PATH.exists():
        print(f"No database at {DB_PATH} — nothing to migrate. Run seed.py instead.")
        return

    conn = sqlite3.connect(DB_PATH)
    try:
        if _has_column(conn, "questions", "puzzle_date"):
            print("Column puzzle_date already present.")
        else:
            # NUMERIC affinity, but ISO date strings aren't coercible to a
            # number so SQLite keeps them as TEXT — which is exactly what
            # SQLAlchemy's Date type expects to read back.
            conn.execute("ALTER TABLE questions ADD COLUMN puzzle_date DATE")
            print("Added column puzzle_date.")

        # Created before the backfill so a duplicate date fails loudly rather
        # than being written.
        conn.execute(f"CREATE UNIQUE INDEX IF NOT EXISTS {INDEX_NAME} ON questions (puzzle_date)")

        dated = conn.execute("SELECT COUNT(*) FROM questions WHERE puzzle_date IS NOT NULL").fetchone()[0]
        if dated:
            lo, hi = conn.execute(
                "SELECT MIN(puzzle_date), MAX(puzzle_date) FROM questions WHERE puzzle_date IS NOT NULL"
            ).fetchone()
            print(f"Already scheduled: {dated} question(s), {lo} .. {hi} — leaving them alone.")
            conn.commit()
            return

        ids = [row[0] for row in conn.execute("SELECT id FROM questions ORDER BY id")]
        if not ids:
            print("No questions to schedule — run seed.py.")
            conn.commit()
            return

        start = BACKFILL_END - timedelta(days=len(ids) - 1)
        conn.executemany(
            "UPDATE questions SET puzzle_date = ? WHERE id = ?",
            [((start + timedelta(days=i)).isoformat(), qid) for i, qid in enumerate(ids)],
        )
        conn.commit()

        rows = conn.execute(
            "SELECT puzzle_date, id, name FROM questions ORDER BY puzzle_date"
        ).fetchall()
        print(f"Scheduled {len(rows)} questions:")
        print(f"  first  {rows[0][0]}  id {rows[0][1]}  {rows[0][2]}")
        print(f"  last   {rows[-1][0]}  id {rows[-1][1]}  {rows[-1][2]}")
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
