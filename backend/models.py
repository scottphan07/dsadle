from sqlalchemy import Integer, String, Text
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
