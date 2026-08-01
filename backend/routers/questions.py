import os

from fastapi import APIRouter, Depends, HTTPException, Security
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db

# These endpoints return full rows (name + description), which would leak the
# daily answer — so they require an API key. Set API_KEY in the environment;
# the default is for local development only.
API_KEY = os.environ.get("API_KEY", "dev-key")
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(key: str | None = Security(api_key_header)):
    if key != API_KEY:
        raise HTTPException(status_code=401, detail="Missing or invalid X-API-Key header")


router = APIRouter(
    prefix="/api/questions",
    tags=["questions (admin)"],
    dependencies=[Depends(require_api_key)],
)


def _get_or_404(db: Session, question_id: int) -> models.Question:
    question = db.get(models.Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail=f"Question {question_id} not found")
    return question


@router.get("", response_model=list[schemas.QuestionOut])
def list_questions(db: Session = Depends(get_db)):
    return list(db.scalars(select(models.Question).order_by(models.Question.id)))


@router.get("/{question_id}", response_model=schemas.QuestionOut)
def get_question(question_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, question_id)


@router.post("", response_model=schemas.QuestionOut, status_code=201)
def create_question(payload: schemas.QuestionCreate, db: Session = Depends(get_db)):
    exists = db.scalar(select(models.Question).where(models.Question.name == payload.name))
    if exists:
        raise HTTPException(status_code=409, detail=f"A question named {payload.name!r} already exists")
    question = models.Question(**payload.model_dump())
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


@router.put("/{question_id}", response_model=schemas.QuestionOut)
def update_question(question_id: int, payload: schemas.QuestionUpdate, db: Session = Depends(get_db)):
    question = _get_or_404(db, question_id)
    updates = payload.model_dump(exclude_unset=True)
    new_name = updates.get("name")
    if new_name and new_name != question.name:
        exists = db.scalar(select(models.Question).where(models.Question.name == new_name))
        if exists:
            raise HTTPException(status_code=409, detail=f"A question named {new_name!r} already exists")
    for field, value in updates.items():
        setattr(question, field, value)
    db.commit()
    db.refresh(question)
    return question


@router.delete("/{question_id}", status_code=204)
def delete_question(question_id: int, db: Session = Depends(get_db)):
    db.delete(_get_or_404(db, question_id))
    db.commit()
