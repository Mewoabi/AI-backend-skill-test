"""Service layer for briefing CRUD and report generation.

All database interactions for the briefings feature live here, keeping
route handlers thin and business logic testable in isolation.
"""

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.briefing import Briefing
from app.models.briefing_metric import BriefingMetric
from app.models.briefing_point import BriefingPoint
from app.schemas.briefing import BriefingCreate


def create_briefing(db: Session, payload: BriefingCreate) -> Briefing:
    """Persist a new briefing with its points and optional metrics.

    Key points and risks are stored as BriefingPoint rows with a `type`
    discriminator and a `display_order` that mirrors the submission order.

    Args:
        db:      Active SQLAlchemy session (injected via FastAPI Depends).
        payload: Validated BriefingCreate input.

    Returns:
        The newly created Briefing ORM instance with relationships loaded.
    """
    briefing = Briefing(
        company_name=payload.company_name,
        ticker=payload.ticker,   # already normalised to uppercase by schema
        sector=payload.sector,
        analyst_name=payload.analyst_name,
        summary=payload.summary,
        recommendation=payload.recommendation,
    )

    # Attach key points, preserving submission order via display_order
    for idx, content in enumerate(payload.key_points):
        briefing.points.append(
            BriefingPoint(type="key_point", content=content, display_order=idx)
        )

    # Attach risks after key points; display_order is scoped per type during rendering
    for idx, content in enumerate(payload.risks):
        briefing.points.append(
            BriefingPoint(type="risk", content=content, display_order=idx)
        )

    # Metrics are optional; skip if not provided
    if payload.metrics:
        for metric in payload.metrics:
            briefing.metrics.append(
                BriefingMetric(name=metric.name, value=metric.value)
            )

    db.add(briefing)
    db.commit()
    # Reload with relationships so the returned object is fully populated
    db.refresh(briefing)
    return _load_briefing(db, briefing.id)  # type: ignore[return-value]


def list_briefings(db: Session, skip: int = 0, limit: int = 50) -> list[Briefing]:
    """Return all briefings, newest first, with pagination support.

    Args:
        db:    Active SQLAlchemy session.
        skip:  Number of records to skip.
        limit: Maximum number of records to return.
    """
    from sqlalchemy import desc

    stmt = (
        select(Briefing)
        .options(
            selectinload(Briefing.points),
            selectinload(Briefing.metrics),
        )
        .order_by(desc(Briefing.created_at))
        .offset(skip)
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


def get_briefing(db: Session, briefing_id: int) -> Briefing | None:
    """Fetch a single briefing by primary key, including its points and metrics.

    Returns None when no briefing with the given id exists.
    """
    return _load_briefing(db, briefing_id)


def generate_briefing_report(db: Session, briefing_id: int) -> Briefing:
    """Render the HTML report for a briefing and persist it.

    Fetches the stored briefing, builds a view model via ReportFormatter,
    renders the Jinja2 template, then updates `html_content` and
    `generated_at` on the record.  Re-generation is allowed — each call
    overwrites the previous output with a fresh timestamp.

    Args:
        db:          Active SQLAlchemy session.
        briefing_id: Primary key of the briefing to generate.

    Returns:
        The updated Briefing instance.

    Raises:
        HTTPException 404: When no briefing with `briefing_id` exists.
    """
    # Import here to avoid circular imports at module load time
    from app.services.report_formatter import ReportFormatter

    briefing = _load_briefing(db, briefing_id)
    if briefing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Briefing not found"
        )

    formatter = ReportFormatter()
    rendered_html = formatter.render_briefing_report(briefing)

    briefing.html_content = rendered_html
    briefing.generated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(briefing)
    return _load_briefing(db, briefing_id)  # type: ignore[return-value]


def get_briefing_html(db: Session, briefing_id: int) -> tuple[Briefing | None, str | None]:
    """Return (briefing, html_content) for a generated briefing.

    Returns (None, None) when the briefing does not exist.
    Returns (briefing, None) when the briefing exists but has not been generated yet.
    """
    briefing = _load_briefing(db, briefing_id)
    if briefing is None:
        return None, None
    return briefing, briefing.html_content


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _load_briefing(db: Session, briefing_id: int) -> Briefing | None:
    """Execute a SELECT with eager-loaded relationships for a single briefing."""
    stmt = (
        select(Briefing)
        .options(
            selectinload(Briefing.points),
            selectinload(Briefing.metrics),
        )
        .where(Briefing.id == briefing_id)
    )
    return db.execute(stmt).scalars().first()
