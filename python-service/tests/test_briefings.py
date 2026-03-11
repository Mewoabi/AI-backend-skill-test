"""Tests for the briefings API endpoints.

Uses the shared `client` fixture from conftest.py which provides a
TestClient backed by an in-memory SQLite database, giving each test a
clean schema without requiring a live PostgreSQL connection.
"""

from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

VALID_PAYLOAD: dict = {
    "companyName": "Acme Holdings",
    "ticker": "acme",  # intentionally lowercase — should be uppercased
    "sector": "Industrial Technology",
    "analystName": "Jane Doe",
    "summary": "Acme is benefiting from strong enterprise demand.",
    "recommendation": "Monitor for margin expansion before increasing exposure.",
    "keyPoints": [
        "Revenue grew 18% year-over-year.",
        "Management raised full-year guidance.",
        "Enterprise subscriptions account for 62% of recurring revenue.",
    ],
    "risks": [
        "Top two customers account for 41% of total revenue.",
        "International expansion may pressure margins.",
    ],
    "metrics": [
        {"name": "Revenue Growth", "value": "18%"},
        {"name": "Operating Margin", "value": "22.4%"},
        {"name": "P/E Ratio", "value": "28.1x"},
    ],
}


def _create(client: TestClient, payload: dict | None = None) -> dict:
    """Helper: POST a briefing and return the response JSON."""
    resp = client.post("/briefings", json=payload or VALID_PAYLOAD)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ---------------------------------------------------------------------------
# POST /briefings — creation
# ---------------------------------------------------------------------------


def test_create_briefing_success(client: TestClient) -> None:
    """A fully valid payload should return 201 with all fields populated."""
    data = _create(client)

    assert data["id"] == 1
    assert data["company_name"] == "Acme Holdings"
    assert data["ticker"] == "ACME"  # normalised to uppercase
    assert data["sector"] == "Industrial Technology"
    assert data["analyst_name"] == "Jane Doe"
    assert data["summary"] == "Acme is benefiting from strong enterprise demand."
    assert data["generated_at"] is None  # not yet generated
    assert len(data["points"]) == 5  # 3 key_points + 2 risks
    assert len(data["metrics"]) == 3


def test_create_briefing_ticker_uppercased(client: TestClient) -> None:
    """Ticker should always be stored as uppercase regardless of input case."""
    data = _create(client, {**VALID_PAYLOAD, "ticker": "acme"})
    assert data["ticker"] == "ACME"


def test_create_briefing_missing_company_name(client: TestClient) -> None:
    """Missing companyName should return 422 Unprocessable Entity."""
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "companyName"}
    resp = client.post("/briefings", json=payload)
    assert resp.status_code == 422


def test_create_briefing_missing_summary(client: TestClient) -> None:
    """Missing summary should return 422."""
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "summary"}
    resp = client.post("/briefings", json=payload)
    assert resp.status_code == 422


def test_create_briefing_missing_recommendation(client: TestClient) -> None:
    """Missing recommendation should return 422."""
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "recommendation"}
    resp = client.post("/briefings", json=payload)
    assert resp.status_code == 422


def test_create_briefing_too_few_key_points(client: TestClient) -> None:
    """Fewer than 2 key points should return 422."""
    resp = client.post("/briefings", json={**VALID_PAYLOAD, "keyPoints": ["Only one point"]})
    assert resp.status_code == 422


def test_create_briefing_no_risks(client: TestClient) -> None:
    """An empty risks list should return 422 (at least 1 required)."""
    resp = client.post("/briefings", json={**VALID_PAYLOAD, "risks": []})
    assert resp.status_code == 422


def test_create_briefing_duplicate_metric_names(client: TestClient) -> None:
    """Duplicate metric names (case-insensitive) within a briefing should return 422."""
    payload = {
        **VALID_PAYLOAD,
        "metrics": [
            {"name": "Revenue Growth", "value": "18%"},
            {"name": "revenue growth", "value": "20%"},  # duplicate
        ],
    }
    resp = client.post("/briefings", json=payload)
    assert resp.status_code == 422


def test_create_briefing_optional_metrics_omitted(client: TestClient) -> None:
    """Omitting metrics entirely should succeed — metrics are optional."""
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "metrics"}
    data = _create(client, payload)
    assert data["metrics"] == []


def test_create_briefing_key_points_order_preserved(client: TestClient) -> None:
    """Key points should be stored and returned in submission order."""
    data = _create(client)
    key_point_rows = sorted(
        [p for p in data["points"] if p["type"] == "key_point"],
        key=lambda p: p["display_order"],
    )
    assert key_point_rows[0]["content"] == "Revenue grew 18% year-over-year."
    assert key_point_rows[1]["content"] == "Management raised full-year guidance."


# ---------------------------------------------------------------------------
# GET /briefings/{id} — retrieval
# ---------------------------------------------------------------------------


def test_get_briefing_success(client: TestClient) -> None:
    """Creating then fetching a briefing should return the full record."""
    created = _create(client)
    resp = client.get(f"/briefings/{created['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == created["id"]
    assert data["ticker"] == "ACME"
    assert len(data["points"]) == 5


def test_get_briefing_not_found(client: TestClient) -> None:
    """Fetching a nonexistent briefing id should return 404."""
    resp = client.get("/briefings/9999")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /briefings — list
# ---------------------------------------------------------------------------


def test_list_briefings(client: TestClient) -> None:
    """Creating two briefings and listing should return both."""
    _create(client)
    _create(client, {**VALID_PAYLOAD, "ticker": "XYZ"})
    resp = client.get("/briefings")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 2


# ---------------------------------------------------------------------------
# POST /briefings/{id}/generate
# ---------------------------------------------------------------------------


def test_generate_report_sets_generated_at(client: TestClient) -> None:
    """After generation, generated_at should be set and html_content stored."""
    created = _create(client)
    resp = client.post(f"/briefings/{created['id']}/generate")
    assert resp.status_code == 200
    data = resp.json()
    assert data["generated_at"] is not None


def test_generate_report_not_found(client: TestClient) -> None:
    """Generating a nonexistent briefing should return 404."""
    resp = client.post("/briefings/9999/generate")
    assert resp.status_code == 404


def test_regenerate_report_is_allowed(client: TestClient) -> None:
    """Re-generating an already-generated briefing should succeed and update timestamp."""
    created = _create(client)
    resp1 = client.post(f"/briefings/{created['id']}/generate")
    resp2 = client.post(f"/briefings/{created['id']}/generate")
    assert resp2.status_code == 200


# ---------------------------------------------------------------------------
# GET /briefings/{id}/html
# ---------------------------------------------------------------------------


def test_get_html_success(client: TestClient) -> None:
    """After generation, /html should return text/html with expected content."""
    created = _create(client)
    client.post(f"/briefings/{created['id']}/generate")

    resp = client.get(f"/briefings/{created['id']}/html")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert "<!DOCTYPE html>" in resp.text
    assert "Acme Holdings" in resp.text
    assert "ACME" in resp.text


def test_get_html_not_generated_returns_404(client: TestClient) -> None:
    """Fetching HTML for a briefing that has not been generated should return 404."""
    created = _create(client)
    resp = client.get(f"/briefings/{created['id']}/html")
    assert resp.status_code == 404


def test_get_html_briefing_not_found(client: TestClient) -> None:
    """Fetching HTML for a nonexistent briefing should return 404."""
    resp = client.get("/briefings/9999/html")
    assert resp.status_code == 404


def test_get_html_renders_all_sections(client: TestClient) -> None:
    """The rendered HTML should contain all required report sections."""
    created = _create(client)
    client.post(f"/briefings/{created['id']}/generate")
    resp = client.get(f"/briefings/{created['id']}/html")

    html = resp.text
    # Company information block
    assert "Industrial Technology" in html
    assert "Jane Doe" in html
    # Executive summary
    assert "strong enterprise demand" in html
    # Key points
    assert "Revenue grew 18%" in html
    # Risks section
    assert "Top two customers" in html
    # Recommendation
    assert "Monitor for margin expansion" in html
    # Metrics table
    assert "P/E Ratio" in html
    # Footer timestamp
    assert "Generated:" in html


def test_get_html_no_metrics_graceful(client: TestClient) -> None:
    """Report without metrics should still render without error."""
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "metrics"}
    created = _create(client, payload)
    client.post(f"/briefings/{created['id']}/generate")
    resp = client.get(f"/briefings/{created['id']}/html")
    assert resp.status_code == 200
    # Key Metrics heading should not appear when no metrics were provided
    assert "Key Metrics" not in resp.text
