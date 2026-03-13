"""Report formatter: transforms ORM records into template-ready view models
and delegates rendering to the Jinja2 template engine.

Keeping this layer separate from both the service (DB logic) and the route
(HTTP concerns) ensures the HTML output can be tested and updated without
touching business or transport code.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

from jinja2 import Environment, FileSystemLoader, select_autoescape

if TYPE_CHECKING:
    from app.models.briefing import Briefing

_TEMPLATE_DIR = Path(__file__).resolve().parents[1] / "templates"


class ReportFormatter:
    """Jinja2-backed formatter for producing rendered HTML reports.

    Instantiated per-request in the service layer; the Jinja2 Environment
    is lightweight enough that this does not carry significant overhead.
    """

    def __init__(self) -> None:
        self._env = Environment(
            loader=FileSystemLoader(str(_TEMPLATE_DIR)),
            # Auto-escape all HTML/XML templates — user content is safely encoded
            autoescape=select_autoescape(
                enabled_extensions=("html", "xml"), default_for_string=True
            ),
        )

    # ------------------------------------------------------------------
    # Starter utility (kept for backwards compatibility)
    # ------------------------------------------------------------------

    def render_base(self, title: str, body: str) -> str:
        template = self._env.get_template("base.html")
        return template.render(title=title, body=body, generated_at=self.generated_timestamp())

    # ------------------------------------------------------------------
    # Briefing report
    # ------------------------------------------------------------------

    def build_briefing_view_model(self, briefing: Briefing) -> dict:
        """Transform a Briefing ORM record into a flat, template-ready dict.

        Responsibilities handled here (not in the template or route):
        - Separate and sort key points vs. risks by display_order
        - Normalise metric labels to title-case for consistent presentation
        - Construct a descriptive report title
        - Generate the display-ready timestamp
        """
        # Separate and sort the two point types by their stored display_order
        key_points = sorted(
            (p for p in briefing.points if p.type == "key_point"),
            key=lambda p: p.display_order,
        )
        risks = sorted(
            (p for p in briefing.points if p.type == "risk"),
            key=lambda p: p.display_order,
        )

        # Normalise metric label capitalisation (e.g. "revenue growth" → "Revenue Growth")
        metrics = [
            {"label": m.name.strip().title(), "value": m.value}
            for m in briefing.metrics
        ]

        return {
            "title": f"Briefing Report: {briefing.company_name} ({briefing.ticker})",
            "company_name": briefing.company_name,
            "ticker": briefing.ticker,
            "sector": briefing.sector or "N/A",
            "analyst_name": briefing.analyst_name or "N/A",
            "summary": briefing.summary,
            "key_points": [p.content for p in key_points],
            "risks": [p.content for p in risks],
            "recommendation": briefing.recommendation,
            # Empty list when no metrics were provided — template handles gracefully
            "metrics": metrics,
            "generated_at": self.generated_timestamp(),
        }

    def render_briefing_report(self, briefing: Briefing) -> str:
        """Render a complete HTML briefing report from a Briefing ORM object.

        Args:
            briefing: A fully loaded Briefing instance (with points and metrics).

        Returns:
            Rendered HTML string, safe for storage and direct HTTP response.
        """
        view_model = self.build_briefing_view_model(briefing)
        template = self._env.get_template("briefing_report.html")
        return template.render(**view_model)

    # ------------------------------------------------------------------
    # Shared utilities
    # ------------------------------------------------------------------

    @staticmethod
    def generated_timestamp() -> str:
        """Return the current UTC time formatted for display in reports."""
        return datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
