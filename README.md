# Backend Engineering Assessment

This repository implements the backend engineering take-home assessment across two independent services:

- `python-service/` — **InsightOps** (FastAPI + SQLAlchemy): Mini Briefing Report Generator
- `ts-service/` — **TalentFlow** (NestJS + TypeORM): Candidate Document Intake + Summary Workflow

Both services share a single PostgreSQL 16 database (see Docker Compose below).

---

## Prerequisites

| Tool | Version |
|------|---------|
| Docker | any recent |
| Python | 3.12+ |
| Node.js | 22+ |
| npm | 10+ |

---

## Quick Start

### 1. Start PostgreSQL

```bash
docker compose up -d postgres
```

This starts PostgreSQL on `localhost:5432`:

- Database: `assessment_db`
- User: `assessment_user`
- Password: `assessment_pass`

---

### 2. Python Service (InsightOps)

```bash
cd python-service

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Run migrations
python -m app.db.run_migrations up

# Start the server (http://localhost:8000)
python -m uvicorn app.main:app --reload --port 8000

# Run tests (no database required — uses in-memory SQLite)
python -m pytest
```

**Briefing API endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/briefings` | Create a briefing |
| GET | `/briefings` | List all briefings |
| GET | `/briefings/{id}` | Retrieve a briefing |
| POST | `/briefings/{id}/generate` | Generate HTML report |
| GET | `/briefings/{id}/html` | Fetch rendered HTML |

**Swagger UI:** open http://localhost:8000/docs in your browser once the server is running. All endpoints are interactively testable — no auth headers required for this service.

---

### 3. TypeScript Service (TalentFlow)

```bash
cd ts-service

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Add your Gemini API key to .env (see below for how to get one)
# GEMINI_API_KEY=your_key_here

# Run migrations
npm run migration:run

# Start the server (http://localhost:3000)
npm run start:dev

# Run unit tests
npm test
```

**Candidate API endpoints** — all require `x-user-id` and `x-workspace-id` headers:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sample/candidates` | Create a candidate (also auto-creates workspace) |
| GET | `/sample/candidates` | List candidates in workspace |
| POST | `/candidates/:id/documents` | Upload a document |
| GET | `/candidates/:id/documents` | List documents |
| POST | `/candidates/:id/summaries/generate` | Queue summary generation (202) |
| GET | `/candidates/:id/summaries` | List summaries |
| GET | `/candidates/:id/summaries/:summaryId` | Get a summary |

**Swagger UI:** open http://localhost:3000/docs in your browser once the server is running.

- Click **Authorize** (top right), enter any values for `x-user-id` and `x-workspace-id` (e.g. `user-1` / `workspace-1`), then click **Authorize** and **Close**
- All subsequent requests from Swagger will include those headers automatically
- To get a `candidateId`, first call `POST /sample/candidates` and copy the `id` from the response

---

## Gemini API Key Setup

Summary generation uses Google's Gemini API. A free key can be obtained from Google AI Studio.

1. Go to https://aistudio.google.com/apikey
2. Create a new API key
3. Add it to `ts-service/.env`:
   ```
   GEMINI_API_KEY=your_key_here
   ```

**When `GEMINI_API_KEY` is not set**, the service automatically falls back to `FakeSummarizationProvider` which returns deterministic mock responses — useful for local development and all automated tests.

> **Never commit API keys.** The `.gitignore` excludes `.env` files.

---

## Running Tests

### Python (23 tests)

```bash
cd python-service
source .venv/bin/activate
python -m pytest -v
```

Tests use in-memory SQLite — no PostgreSQL connection required.

### TypeScript (22 tests)

```bash
cd ts-service
npm test
```

Tests use mocked repositories and `FakeSummarizationProvider` — no PostgreSQL or Gemini API required.

---

## Rolling Back Migrations

### Python

```bash
cd python-service
python -m app.db.run_migrations down --steps 1
```

### TypeScript

```bash
cd ts-service
npm run migration:revert
```

---

## Notes & Design Decisions

See [NOTES.md](NOTES.md) for design decisions, schema rationale, tradeoffs, and what would be improved with more time.
