"""Sandbox mode: replay past daily puzzles, filtered by difficulty and tag.

The eligible pool is every question whose puzzle_date is strictly before today
(UTC). Today's and future puzzles never appear, so the sandbox can't be used to
preview a daily. Unscheduled questions are excluded too: one could be given a
date later, and players would already have seen it here.

Like the daily game this is stateless — the client keeps the session and sends
its full guess list each time.
"""

import hashlib
import hmac
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from routers.game import _all_questions, clues_for, date_for_idx, evaluate, today_idx
from routers.questions import API_KEY
from tags import TAGS

router = APIRouter(prefix="/api/sandbox", tags=["sandbox"])


def round_id_for(question: models.Question) -> str:
    """A stable, opaque id for a question.

    Derived from the name rather than the row id, because Render reseeds on
    every boot and ids are not guaranteed to survive that. Keyed with the
    server's secret so nobody can hash the public name list and read the
    answer off a round_id.
    """
    digest = hmac.new(API_KEY.encode(), question.name.encode(), hashlib.sha256)
    return digest.hexdigest()[:16]


def _eligible(db: Session) -> list[models.Question]:
    today = date_for_idx(today_idx())
    return list(
        db.scalars(
            select(models.Question)
            .where(models.Question.puzzle_date.is_not(None), models.Question.puzzle_date < today)
            .order_by(models.Question.puzzle_date)
        )
    )


def _matches(q: models.Question, difficulties: list[str], tags: list[str]) -> bool:
    if difficulties and q.difficulty not in difficulties:
        return False
    if tags and not set(tags) & set(q.tags):
        return False
    return True


@router.get("/facets", response_model=schemas.FacetsOut)
def facets(db: Session = Depends(get_db)):
    """The tag vocabulary plus (difficulty, tags) for every eligible puzzle — no names."""
    return schemas.FacetsOut(
        tags=[schemas.TagInfo(slug=slug, label=label) for slug, label in TAGS.items()],
        items=[schemas.FacetItem(difficulty=q.difficulty, tags=q.tags) for q in _eligible(db)],
    )


@router.post("/round", response_model=schemas.SandboxRoundOut)
def new_round(req: schemas.SandboxRoundRequest, db: Session = Depends(get_db)):
    """Pick a random eligible puzzle matching the filter."""
    matches = [q for q in _eligible(db) if _matches(q, req.difficulties, req.tags)]
    if not matches:
        raise HTTPException(status_code=404, detail="No past puzzles match that filter")

    played = set(req.exclude)
    fresh = [q for q in matches if round_id_for(q) not in played]
    if not fresh:
        # Every match has been played: start repeating, but never the round
        # that was just played, when there's any alternative.
        last = req.exclude[-1] if req.exclude else None
        fresh = [q for q in matches if round_id_for(q) != last] or matches
    answer = random.choice(fresh)

    # The guess list deliberately ignores difficulty: "Easy Tree" lists every
    # tree, or the dropdown would give the answer away on a narrow filter. It
    # draws on the whole bank, not just eligible puzzles, like the daily game.
    if req.tags:
        wanted = set(req.tags)
        candidates = [q.name for q in _all_questions(db) if wanted & set(q.tags)]
    else:
        candidates = [q.name for q in _all_questions(db)]

    return schemas.SandboxRoundOut(
        round_id=round_id_for(answer),
        difficulty=answer.difficulty,
        clues=clues_for(answer),
        candidates=sorted(candidates, key=str.casefold),
    )


@router.post("/guess", response_model=schemas.GuessResponse)
def guess(req: schemas.SandboxGuessRequest, db: Session = Depends(get_db)):
    """Evaluate a full guess list for a sandbox round. Same response as the daily guess."""
    answer = next((q for q in _eligible(db) if round_id_for(q) == req.round_id), None)
    if answer is None:
        raise HTTPException(status_code=404, detail="Unknown round")
    return evaluate(db, answer, req.guesses)
