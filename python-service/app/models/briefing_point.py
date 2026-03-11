from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class BriefingPoint(Base):
    """A single key point or risk belonging to a briefing.

    The `type` column distinguishes key points ('key_point') from risks
    ('risk'). `display_order` preserves the original insertion order so
    the report renders items in the analyst's intended sequence.
    """

    __tablename__ = "briefing_points"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    briefing_id: Mapped[int] = mapped_column(ForeignKey("briefings.id"), nullable=False)
    # Allowed values enforced by CHECK constraint in the migration
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    briefing: Mapped[Briefing] = relationship("Briefing", back_populates="points")


from app.models.briefing import Briefing  # noqa: E402
