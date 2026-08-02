from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

# ── Question admin schemas ──────────────────────────────────────────────────


class QuestionBase(BaseModel):
    name: str = Field(min_length=1)
    category: Literal["data_structure", "algorithm"]
    family: str = Field(min_length=1)
    time_complexity: str = Field(min_length=1, examples=["O(n log n)"])
    space_complexity: str = Field(min_length=1, examples=["O(1)"])
    difficulty: Literal["Beginner", "Intermediate", "Advanced"]
    top_operation: str = "Running time"
    use_case: str = Field(min_length=1)
    description: str = Field(min_length=1)
    code: str = "# implementation coming soon"
    # The day this question is the answer for. Unique; omit or send null to
    # leave it unscheduled. Inherited by QuestionOut, so admins read the
    # schedule back — deliberately absent from DailyClues, which is how the
    # answer-identifying fields stay structurally unable to leak.
    puzzle_date: Optional[date] = None


class QuestionCreate(QuestionBase):
    pass


class QuestionUpdate(BaseModel):
    """Partial update: only the provided fields are changed."""

    name: Optional[str] = None
    category: Optional[Literal["data_structure", "algorithm"]] = None
    family: Optional[str] = None
    time_complexity: Optional[str] = None
    space_complexity: Optional[str] = None
    difficulty: Optional[Literal["Beginner", "Intermediate", "Advanced"]] = None
    top_operation: Optional[str] = None
    use_case: Optional[str] = None
    description: Optional[str] = None
    code: Optional[str] = None
    # model_dump(exclude_unset=True) distinguishes "omitted" from "sent as
    # null", so an explicit null here unschedules the question.
    puzzle_date: Optional[date] = None


class QuestionOut(QuestionBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# ── Game schemas (answer-safe: never include name/description) ─────────────


class DailyClues(BaseModel):
    category: str    # "Data Structure" | "Algorithm"
    use_case: str
    time_clue: str   # e.g. "Sort: O(n log n)"
    space_clue: str  # e.g. "Uses O(1) space"
    code: str


class DailyOut(BaseModel):
    day_idx: int
    clues: DailyClues


class DayRangeOut(BaseModel):
    """Which days are actually playable — the calendar's source of truth.

    `day_idxs` is the full sorted list rather than just the endpoints so the
    UI stays correct when the schedule has gaps (a deleted or rescheduled
    question); first/last are conveniences derived from it. All three are
    null/empty when nothing is scheduled yet.
    """

    first_day_idx: Optional[int]
    last_day_idx: Optional[int]
    today_day_idx: int  # server-side today, so the UI needn't trust the browser clock
    day_idxs: list[int]


class GuessRequest(BaseModel):
    day_idx: int
    guesses: list[str] = Field(min_length=1, max_length=5)


class Reveal(BaseModel):
    name: str
    description: str


class GuessResponse(BaseModel):
    results: list[bool]
    won: bool
    game_over: bool
    reveal: Optional[Reveal] = None  # only present once the game is over
