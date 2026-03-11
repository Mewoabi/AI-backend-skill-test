from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Input schemas
# ---------------------------------------------------------------------------


class MetricInput(BaseModel):
    """A single name/value metric included in a briefing creation request."""

    name: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=120)


class BriefingCreate(BaseModel):
    """Validated request payload for creating a new briefing.

    Accepts camelCase keys from the API consumer (via aliases) while also
    supporting snake_case for convenience (`populate_by_name=True`).
    """

    model_config = ConfigDict(populate_by_name=True)

    company_name: str = Field(alias="companyName", min_length=1, max_length=200)
    ticker: str = Field(min_length=1, max_length=10)
    sector: str | None = Field(default=None, max_length=100)
    analyst_name: str | None = Field(default=None, alias="analystName", max_length=120)
    summary: str = Field(min_length=1)
    recommendation: str = Field(min_length=1)
    # At least 2 key points are required by task specification
    key_points: list[str] = Field(alias="keyPoints", min_length=2)
    # At least 1 risk is required
    risks: list[str] = Field(min_length=1)
    metrics: list[MetricInput] | None = Field(default=None)

    @field_validator("ticker")
    @classmethod
    def normalize_ticker(cls, v: str) -> str:
        """Normalize ticker to uppercase and strip surrounding whitespace."""
        return v.strip().upper()

    @field_validator("company_name", "summary", "recommendation", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        """Strip leading/trailing whitespace from core text fields."""
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("key_points", "risks")
    @classmethod
    def validate_non_empty_strings(cls, items: list[str]) -> list[str]:
        """Ensure each item in a list is a non-empty, non-whitespace string."""
        for item in items:
            if not isinstance(item, str) or not item.strip():
                raise ValueError("Each item must be a non-empty string")
        return items

    @model_validator(mode="after")
    def validate_unique_metric_names(self) -> "BriefingCreate":
        """Metric names must be unique (case-insensitive) within a single briefing."""
        if self.metrics:
            names = [m.name.strip().lower() for m in self.metrics]
            if len(names) != len(set(names)):
                raise ValueError("Metric names must be unique within the same briefing")
        return self


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------


class BriefingPointRead(BaseModel):
    """Serialized representation of a briefing_points row."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    briefing_id: int
    type: str
    content: str
    display_order: int
    created_at: datetime


class BriefingMetricRead(BaseModel):
    """Serialized representation of a briefing_metrics row."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    briefing_id: int
    name: str
    value: str
    created_at: datetime


class BriefingRead(BaseModel):
    """Full briefing record returned by the API, including nested points and metrics."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    company_name: str
    ticker: str
    sector: str | None
    analyst_name: str | None
    summary: str
    recommendation: str
    generated_at: datetime | None
    # html_content is intentionally excluded from the JSON response;
    # clients should use GET /briefings/{id}/html to retrieve rendered HTML.
    created_at: datetime
    points: list[BriefingPointRead]
    metrics: list[BriefingMetricRead]

    @property
    def status(self) -> str:
        """Human-readable generation status: 'generated' or 'draft'."""
        return "generated" if self.generated_at is not None else "draft"
