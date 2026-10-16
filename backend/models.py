from datetime import date
from typing import Optional

from sqlalchemy import Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class QuestionTag(Base):
    """One (question, tag) pair: the join table behind multi-tag filtering.

    A question has several rows here (Minimum Spanning Tree → graph, tree), so
    "every Tree question" is a single indexed lookup on `tag` rather than a
    string search. Tags are slugs from tags.py.
    """

    __tablename__ = "question_tags"

    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), primary_key=True
    )
    tag: Mapped[str] = mapped_column(String, primary_key=True, index=True)


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

    # selectin: one extra query loads the tags for every question in a list,
    # instead of one query per question.
    tag_rows: Mapped[list[QuestionTag]] = relationship(
        cascade="all, delete-orphan", lazy="selectin", order_by=QuestionTag.tag
    )

    @property
    def tags(self) -> list[str]:
        return [row.tag for row in self.tag_rows]

    @tags.setter
    def tags(self, value: list[str]) -> None:
        # Lets Question(**payload) and setattr(question, "tags", ...) work like
        # any other column for the seed script and the admin API.
        # Existing rows are kept rather than recreated: deleting and re-inserting
        # the same (question_id, tag) key in one flush can trip the primary key.
        current = {row.tag: row for row in self.tag_rows}
        self.tag_rows = [current.get(t) or QuestionTag(tag=t) for t in dict.fromkeys(value)]
