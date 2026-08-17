from datetime import date
from typing import Optional

from sqlalchemy import Date, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True)
    category: Mapped[str] = mapped_column(String)  # "data_structure" | "algorithm"
    family: Mapped[str] = mapped_column(String)
    time_complexity: Mapped[str] = mapped_column(String)   # e.g. "O(n log n)"
    space_complexity: Mapped[str] = mapped_column(String)  # e.g. "O(1)"
    difficulty: Mapped[str] = mapped_column(String)        # Beginner | Intermediate | Advanced
    top_operation: Mapped[str] = mapped_column(String, default="Running time")
    use_case: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text)
    code: Mapped[str] = mapped_column(Text, default="# implementation coming soon")

    # Unique, so two questions can't claim the same day; nullable, so a question
    # can sit in the bank unscheduled — still guessable, never the answer.
    # create_all() creates missing tables but never alters an existing one, so
    # existing databases need backend/migrate_puzzle_dates.py.
    puzzle_date: Mapped[Optional[date]] = mapped_column(
        Date, unique=True, index=True, nullable=True, default=None
    )
