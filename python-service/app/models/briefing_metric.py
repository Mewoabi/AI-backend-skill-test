from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class BriefingMetric(Base):
    """An optional key/value metric associated with a briefing.

    Uniqueness of `name` per `briefing_id` is enforced at the DB level via a
    UNIQUE constraint in the migration, and also validated by the Pydantic
    schema before reaching the service layer.
    """

    __tablename__ = "briefing_metrics"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    briefing_id: Mapped[int] = mapped_column(ForeignKey("briefings.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    briefing: Mapped[Briefing] = relationship("Briefing", back_populates="metrics")


from app.models.briefing import Briefing  # noqa: E402
