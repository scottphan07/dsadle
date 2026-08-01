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
