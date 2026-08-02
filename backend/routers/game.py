import time
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

router = APIRouter(prefix="/api/game", tags=["game"])

MAX_GUESSES = 5

# Day one. _answer_for_day wraps with `day_idx % n`, so without this floor every
# date back to 1970 (and every negative index) returns a real puzzle.
# Mirrored by LAUNCH_DAY in components/DSAdle.tsx — change both.
LAUNCH_DAY_IDX = (date(2026, 6, 21) - date(1970, 1, 1)).days  # 20625


def _check_day(day_idx: int) -> None:
    today = int(time.time() // 86400)
    # One day of slack at the top: the client derives its index from the browser
    # clock, so a player just past UTC midnight — or with a fast clock — would
    # otherwise get a 404 for what is legitimately today's puzzle.
    if day_idx < LAUNCH_DAY_IDX or day_idx > today + 1:
        raise HTTPException(status_code=404, detail="No puzzle for that day")


def _all_questions(db: Session) -> list[models.Question]:
    return list(db.scalars(select(models.Question).order_by(models.Question.id)))


def _answer_for_day(questions: list[models.Question], day_idx: int) -> models.Question:
    if not questions:
        raise HTTPException(status_code=503, detail="No questions in the database — run seed.py")
    n = len(questions)
    return questions[((day_idx % n) + n) % n]


@router.get("/names", response_model=list[str])
def list_names(db: Session = Depends(get_db)):
    """All guessable names, for the autocomplete. Safe: doesn't say which is today's."""
    return [q.name for q in _all_questions(db)]


@router.get("/daily/{day_idx}", response_model=schemas.DailyOut)
def daily(day_idx: int, db: Session = Depends(get_db)):
    """The clues for a given day. Never includes the answer's name or description."""
    _check_day(day_idx)
    answer = _answer_for_day(_all_questions(db), day_idx)
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
    The answer is revealed only once the game is over (won, or 5 guesses used
    — at which point the player would see it in the UI anyway).
    """
    _check_day(req.day_idx)
    questions = _all_questions(db)
    answer = _answer_for_day(questions, req.day_idx)

    known = {q.name for q in questions}
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
