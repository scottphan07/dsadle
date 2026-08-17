import time
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(prefix="/api/game", tags=["game"])

MAX_GUESSES = 5

EPOCH = date(1970, 1, 1)

# Days of tolerance above today when resolving a puzzle. The client anchors on
# last_day_idx from /range rather than its own clock, so slack here would only
# hand out a scheduled future puzzle early.
CLOCK_SKEW_SLACK_DAYS = 0


def _date_for_idx(day_idx: int) -> date:
    return EPOCH + timedelta(days=day_idx)


def _idx_for_date(d: date) -> int:
    return (d - EPOCH).days


def _today_idx() -> int:
    # Not date.today(), which is server-local and rolls the puzzle over at the
    # wrong moment off UTC. Matches the client's Date.now() / 86400000 exactly.
    return int(time.time() // 86400)


def _all_questions(db: Session) -> list[models.Question]:
    return list(db.scalars(select(models.Question).order_by(models.Question.id)))


def _answer_for_day(db: Session, day_idx: int) -> models.Question:
    """The question scheduled for that day, or 404.

    No lower bound: dates before the schedule, gaps in it, and negative indices
    all simply have no row.
    """
    if day_idx > _today_idx() + CLOCK_SKEW_SLACK_DAYS:
        raise HTTPException(status_code=404, detail="No puzzle for that day")
    answer = db.scalar(
        select(models.Question).where(models.Question.puzzle_date == _date_for_idx(day_idx))
    )
    if answer is None:
        raise HTTPException(status_code=404, detail="No puzzle for that day")
    return answer


@router.get("/names", response_model=list[str])
def list_names(db: Session = Depends(get_db)):
    """All guessable names, for the autocomplete. Safe: doesn't say which is today's."""
    return [q.name for q in _all_questions(db)]


@router.get("/range", response_model=schemas.DayRangeOut)
def day_range(db: Session = Depends(get_db)):
    """Which days are playable. Drives the client's calendar, archive and anchor.

    Future days are filtered out so this set is exactly what `/daily/{day_idx}`
    serves; an unscheduled bank returns nulls rather than a 503, which the UI
    could not tell apart from the server being down.
    """
    today = _today_idx()
    scheduled = db.scalars(
        select(models.Question.puzzle_date)
        .where(models.Question.puzzle_date.is_not(None))
        .order_by(models.Question.puzzle_date)
    )
    day_idxs = [idx for idx in (_idx_for_date(d) for d in scheduled) if idx <= today]
    return schemas.DayRangeOut(
        first_day_idx=day_idxs[0] if day_idxs else None,
        last_day_idx=day_idxs[-1] if day_idxs else None,
        today_day_idx=today,
        day_idxs=day_idxs,
    )


@router.get("/daily/{day_idx}", response_model=schemas.DailyOut)
def daily(day_idx: int, db: Session = Depends(get_db)):
    """The clues for a given day. Never includes the answer's name or description."""
    answer = _answer_for_day(db, day_idx)
    return schemas.DailyOut(
        day_idx=day_idx,
        clues=schemas.DailyClues(
            category="Data Structure" if answer.category == "data_structure" else "Algorithm",
            use_case=answer.use_case,
            time_clue=f"{answer.top_operation}: {answer.time_complexity}",
            space_clue=f"Uses {answer.space_complexity} space",
            code=answer.code,
        ),
    )


@router.post("/guess", response_model=schemas.GuessResponse)
def guess(req: schemas.GuessRequest, db: Session = Depends(get_db)):
    """Evaluate a full guess list for a day.

    Stateless: the client sends every guess it has made so far, so the same
    endpoint validates a new guess and reconstructs a saved game on reload.
    """
    answer = _answer_for_day(db, req.day_idx)

    # Every question is a legal guess, scheduled or not — restricting this to
    # scheduled ones would narrow the pool to exactly the answer set.
    known = {q.name for q in _all_questions(db)}
    unknown = [g for g in req.guesses if g not in known]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown guesses: {unknown}")

    results = [g == answer.name for g in req.guesses]
    won = any(results)
    game_over = won or len(req.guesses) >= MAX_GUESSES
    return schemas.GuessResponse(
        results=results,
        won=won,
        game_over=game_over,
        reveal=schemas.Reveal(name=answer.name, description=answer.description) if game_over else None,
    )
