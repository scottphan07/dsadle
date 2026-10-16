from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from tags import TAGS

# Literal over the closed vocabulary, so an unknown tag is a 422 from the admin
# API and an error from validate_seed.py instead of a silently orphaned filter.
Tag = Literal[tuple(TAGS)]
Difficulty = Literal["Beginner", "Intermediate", "Advanced"]

# ── Question admin schemas ──────────────────────────────────────────────────


class QuestionBase(BaseModel):
    name: str = Field(min_length=1)
    category: Literal["data_structure", "algorithm"]
    family: str = Field(min_length=1)
    time_complexity: str = Field(min_length=1, examples=["O(n log n)"])
    space_complexity: str = Field(min_length=1, examples=["O(1)"])
    difficulty: Difficulty
    # At least one: an untagged question could never be reached from a family
    # filter in the sandbox.
    tags: list[Tag] = Field(min_length=1, examples=[["graph", "tree"]])
    top_operation: str = "Running time"
    use_case: str = Field(min_length=1)
    description: str = Field(min_length=1)
    code: str = "# implementation coming soon"
    # Omit or send null to leave the question unscheduled. Inherited by
    # QuestionOut so admins read the schedule back; absent from DailyClues,
    # which is how answer-identifying fields stay structurally unable to leak.
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
    difficulty: Optional[Difficulty] = None
    tags: Optional[list[Tag]] = Field(default=None, min_length=1)
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
    """Which days are playable — the calendar's source of truth.

    `day_idxs` is the full sorted list, not just the endpoints, so the UI stays
    correct when the schedule has gaps; first/last are derived from it.
    """

    first_day_idx: Optional[int]
    last_day_idx: Optional[int]
    today_day_idx: int  # server-side today, so the UI needn't trust the browser clock
    day_idxs: list[int]
    # Whether tomorrow has a puzzle. A bare boolean, so it can't leak which
    # question is coming; lets the results popup skip a countdown to nothing.
    has_next: bool = False


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


# ── Sandbox schemas ─────────────────────────────────────────────────────────


class TagInfo(BaseModel):
    slug: str
    label: str


class FacetItem(BaseModel):
    """One eligible puzzle, minus anything that identifies it.

    The client computes every chip count from this list, which is exact for
    multi-tag unions in a way that precomputed (difficulty, tag) pair counts
    can't be: a puzzle tagged both graph and tree would be counted twice.
    """

    difficulty: str
    tags: list[str]


class FacetsOut(BaseModel):
    tags: list[TagInfo]
    items: list[FacetItem]


class SandboxRoundRequest(BaseModel):
    # Empty list = no filter on that dimension.
    difficulties: list[Difficulty] = []
    tags: list[Tag] = []
    # round_ids already played this session, to avoid immediate repeats. Ignored
    # once every match has been played.
    exclude: list[str] = Field(default=[], max_length=500)


class SandboxRoundOut(BaseModel):
    # Opaque: an HMAC of the answer, so it can't be matched against the name list.
    round_id: str
    difficulty: str
    clues: DailyClues
    # The guess list: every name sharing a selected tag, at any difficulty.
    candidates: list[str]


class SandboxGuessRequest(BaseModel):
    round_id: str = Field(min_length=1, max_length=64)
    guesses: list[str] = Field(min_length=1, max_length=5)
