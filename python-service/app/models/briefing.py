from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Briefing(Base):
    """ORM model for the briefings table.

    Holds the core analyst briefing record. Related points (key points and
    risks) and optional metrics are stored in child tables linked via FK.
    """

    __tablename__ = "briefings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    ticker: Mapped[str] = mapped_column(String(10), nullable=False)  # stored uppercase
    sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    analyst_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    # Null until POST /briefings/{id}/generate is called
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Stored rendered HTML; populated alongside generated_at
    html_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Cascade delete removes child rows when a briefing is deleted
    points: Mapped[list[BriefingPoint]] = relationship(
        "BriefingPoint", back_populates="briefing", cascade="all, delete-orphan"
    )
    metrics: Mapped[list[BriefingMetric]] = relationship(
        "BriefingMetric", back_populates="briefing", cascade="all, delete-orphan"
    )


# Import at the bottom to avoid circular reference at class definition time
from app.models.briefing_point import BriefingPoint  # noqa: E402
from app.models.briefing_metric import BriefingMetric  # noqa: E402
