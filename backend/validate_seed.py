"""Validate seed_data.json before it reaches the database.

Imported by seed.py (which always validates before writing) and runnable on its
own:

    python validate_seed.py [path]

Deliberately DB-free, so it can run while uvicorn holds dsadle.db.

Errors block a write. Warnings and infos are reported and don't — a schedule
with gaps, or unscheduled questions, or a tell in a code snippet are all
legitimate choices, but you should see them before they go live.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from pydantic import ConfigDict, ValidationError

from schemas import QuestionCreate

SEED_FILE = Path(__file__).resolve().parent / "seed_data.json"

# Exactly the fields routers/game.py assembles into DailyClues — i.e. the text
# that ships to the browser in the /daily response. `category` is excluded: it
# is flattened to "Data Structure"/"Algorithm" and can't name the answer.
CLUE_FIELDS = ("use_case", "top_operation", "time_complexity", "space_complexity", "code")

# Below this, the runway warning fires
LOW_RUNWAY_DAYS = 14

# Gaps are listed individually up to here, then summarised
MAX_LISTED_GAPS = 10


class SeedRow(QuestionCreate):
    """QuestionCreate, but rejecting unknown keys.

    Reusing the API's own schema keeps seed data and admin-created rows from
    drifting apart — it already covers the category/difficulty enums, the
    non-empty string rules, and ISO-string -> date coercion.

    `extra="forbid"` is the one thing added here, and it's the whole point: a
    typo like "top_operatoin" would otherwise be dropped silently and the row
    would take the default "Running time" without anyone noticing. Applied only
    to seeding, so the live API's leniency is unchanged.
    """

    model_config = ConfigDict(extra="forbid")


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    infos: list[str] = field(default_factory=list)
    rows: list[SeedRow] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def render(self) -> str:
        # Errors last: in a terminal the final line sits right above the prompt,
        # which is the hardest place to miss it.
        out = [f"  {line}" for line in self.infos]
        out += [f"  WARNING: {line}" for line in self.warnings]
        out += [f"  ERROR:   {line}" for line in self.errors]
        if self.errors:
            out.append(f"  FAILED — {len(self.errors)} error(s); nothing will be written")
        elif self.warnings:
            out.append(f"  passed, with {len(self.warnings)} warning(s) above")
        else:
            out.append("  passed")
        return "\n".join(out)


def _utc_today() -> date:
    """Must match routers/game.py's `int(time.time() // 86400)`.

    date.today() is server-local and would report a different day than the app
    actually serves whenever the local date and the UTC date disagree — which
    is most of the evening in the Americas.
    """
    return datetime.now(timezone.utc).date()


def _norm(s: str) -> str:
    """Casefold and strip separators, so 'Linked List' matches 'class LinkedList'."""
    return re.sub(r"[\s_\-]+", "", s.lower())


def _describe_gaps(scheduled: list[date]) -> list[str]:
    """Gaps are INFO, not errors — a weekdays-only schedule is a valid choice."""
    if len(scheduled) < 2:
        return []
    span = (scheduled[-1] - scheduled[0]).days + 1
    present = set(scheduled)
    missing = [
        scheduled[0] + timedelta(days=i)
        for i in range(span)
        if scheduled[0] + timedelta(days=i) not in present
    ]
    if not missing:
        return [f"schedule is contiguous ({len(scheduled)} consecutive days)"]

    lines = [f"{len(missing)} gap day(s) across a {span}-day span"]
    if all(d.weekday() >= 5 for d in missing):
        lines.append("every gap falls on a Sat/Sun — looks like a weekdays-only schedule")
    else:
        shown = ", ".join(d.isoformat() for d in missing[:MAX_LISTED_GAPS])
        more = f", and {len(missing) - MAX_LISTED_GAPS} more" if len(missing) > MAX_LISTED_GAPS else ""
        lines.append(f"missing: {shown}{more}")
    return lines


def validate(raw: object, today: date | None = None) -> Report:
    """Check a decoded seed_data.json payload. Never touches the database."""
    today = today or _utc_today()
    r = Report()

    if not isinstance(raw, list):
        r.errors.append(f"top level must be a JSON array, got {type(raw).__name__}")
        return r
    if not raw:
        r.errors.append("seed file is empty — there would be nothing to play")
        return r

    # ── per-row schema ────────────────────────────────────────────────────
    for i, row in enumerate(raw):
        if not isinstance(row, dict):
            r.errors.append(f"row {i}: expected an object, got {type(row).__name__}")
            continue
        label = row.get("name") or f"row {i}"
        try:
            r.rows.append(SeedRow(**row))
        except ValidationError as exc:
            for err in exc.errors():
                loc = ".".join(str(p) for p in err["loc"]) or "(row)"
                r.errors.append(f"{label}: {loc} — {err['msg']}")

    if r.errors:
        return r  # nothing below is meaningful if rows didn't parse

    # ── uniqueness (both are unique columns; without this SQLite throws a
    #    bare IntegrityError partway through the insert) ────────────────────
    seen: set[str] = set()
    for row in r.rows:
        if row.name in seen:
            r.errors.append(f"duplicate name {row.name!r}")
        seen.add(row.name)

    by_date: dict[date, str] = {}
    for row in r.rows:
        if row.puzzle_date is None:
            continue
        clash = by_date.get(row.puzzle_date)
        if clash:
            r.errors.append(
                f"{row.puzzle_date}: scheduled twice — {clash!r} and {row.name!r}"
            )
        by_date[row.puzzle_date] = row.name

    # Exact duplicates are an error; case-only collisions merely make both
    # names legal exact-match guesses, which is confusing but playable.
    folded: dict[str, str] = {}
    for row in r.rows:
        key = row.name.casefold()
        if key in folded and folded[key] != row.name:
            r.warnings.append(
                f"{folded[key]!r} and {row.name!r} differ only by case — both are guessable"
            )
        folded[key] = row.name

    # ── answer leaks ──────────────────────────────────────────────────────
    for row in r.rows:
        needle = _norm(row.name)
        if not needle:
            continue
        for f in CLUE_FIELDS:
            if needle in _norm(getattr(row, f) or ""):
                r.warnings.append(
                    f"{row.name!r} appears in its own {f} — that clue ships to the "
                    f"browser in /daily, so the answer is readable in DevTools"
                )
                break

    # ── schedule shape ────────────────────────────────────────────────────
    scheduled = sorted(by_date)
    undated = len(r.rows) - len(scheduled)
    r.infos.insert(0, f"{len(r.rows)} question(s) — {len(scheduled)} scheduled, {undated} unscheduled")

    if undated:
        r.infos.append(f"{undated} unscheduled: guessable, but never the answer")

    if not scheduled:
        r.warnings.append(
            "nothing is scheduled — /api/game/range returns an empty list and the "
            "site renders its empty state"
        )
        return r

    first, last = scheduled[0], scheduled[-1]
    r.infos.append(f"schedule: {first} .. {last}")
    r.infos.extend(_describe_gaps(scheduled))
    r.infos.append(f"today (UTC): {today}")

    if first > today:
        n = (first - today).days
        r.warnings.append(
            f"first puzzle is {n} day(s) out ({first}) — the site shows "
            f'"No puzzles are scheduled yet" until then. Set the earliest '
            f"puzzle_date to {today} or earlier to go live immediately."
        )
    elif last < today:
        r.warnings.append(
            f"the schedule ended {(today - last).days} day(s) ago ({last}) — the app "
            f'parks on the newest puzzle and relabels it "Latest Puzzle"'
        )
    else:
        runway = (last - today).days
        msg = f"{runway} day(s) of runway left after today"
        (r.warnings if runway < LOW_RUNWAY_DAYS else r.infos).append(
            msg + (" — time to add more questions" if runway < LOW_RUNWAY_DAYS else "")
        )

    return r


def load_and_validate(path: Path = SEED_FILE, today: date | None = None) -> Report:
    try:
        raw = json.loads(path.read_text())
    except FileNotFoundError:
        r = Report()
        r.errors.append(f"no such file: {path}")
        return r
    except json.JSONDecodeError as exc:
        r = Report()
        r.errors.append(f"{path.name} is not valid JSON: {exc}")
        return r
    return validate(raw, today=today)


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else SEED_FILE
    report = load_and_validate(path)
    print(f"{path.name}:")
    print(report.render())
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
