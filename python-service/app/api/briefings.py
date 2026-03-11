"""Briefing report API routes.

Endpoints:
  POST /briefings                    — create a new briefing
  GET  /briefings                    — list all briefings (with pagination)
  GET  /briefings/{id}               — retrieve a single briefing
  POST /briefings/{id}/generate      — generate the HTML report
  GET  /briefings/{id}/html          — return rendered HTML
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.briefing import BriefingCreate, BriefingRead
from app.services import briefing_service

router = APIRouter(prefix="/briefings", tags=["briefings"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=BriefingRead)
def create_briefing(payload: BriefingCreate, db: Session = Depends(get_db)) -> BriefingRead:
    """Create a new analyst briefing from structured JSON input.

    Validates all required fields (companyName, ticker, summary, recommendation,
    at least 2 keyPoints, at least 1 risk) and normalises the ticker to uppercase.
    Optional metrics must have unique names within the same briefing.
    """
    briefing = briefing_service.create_briefing(db, payload)
    return BriefingRead.model_validate(briefing)


@router.get("", response_model=list[BriefingRead])
def list_briefings(
    skip: int = 0, limit: int = 50, db: Session = Depends(get_db)
) -> list[BriefingRead]:
    """List all briefings, newest first, with optional pagination.

    Query params:
      skip  — number of records to skip (default 0)
      limit — max records to return (default 50)
    """
    briefings = briefing_service.list_briefings(db, skip=skip, limit=limit)
    return [BriefingRead.model_validate(b) for b in briefings]


@router.get("/{briefing_id}", response_model=BriefingRead)
def get_briefing(briefing_id: int, db: Session = Depends(get_db)) -> BriefingRead:
    """Retrieve the stored structured data for a single briefing."""
    briefing = briefing_service.get_briefing(db, briefing_id)
    if briefing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Briefing not found"
        )
    return BriefingRead.model_validate(briefing)


@router.post("/{briefing_id}/generate", response_model=BriefingRead)
def generate_briefing(briefing_id: int, db: Session = Depends(get_db)) -> BriefingRead:
    """Generate (or re-generate) the HTML report for an existing briefing.

    Renders the Jinja2 template, stores the HTML, and marks the briefing as
    generated.  Calling this endpoint again on an already-generated briefing
    is allowed — the output is refreshed with a new timestamp.
    """
    briefing = briefing_service.generate_briefing_report(db, briefing_id)
    return BriefingRead.model_validate(briefing)


@router.get("/{briefing_id}/html", response_class=HTMLResponse)
def get_briefing_html(briefing_id: int, db: Session = Depends(get_db)) -> HTMLResponse:
    """Return the rendered HTML report for a briefing.

    Returns the raw HTML document (Content-Type: text/html), not JSON.

    Raises:
      404 — briefing not found
      404 — briefing exists but report has not been generated yet
    """
    briefing, html = briefing_service.get_briefing_html(db, briefing_id)

    if briefing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Briefing not found"
        )
    if html is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not yet generated — call POST /briefings/{id}/generate first",
        )

    return HTMLResponse(content=html)
