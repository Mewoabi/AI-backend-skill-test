# InsightOps Python Service

FastAPI service for the backend assessment.

This service includes:

- FastAPI app bootstrap and health endpoint
- SQLAlchemy wiring with relational schema for briefings, points, and metrics
- Manual SQL migration runner
- Briefing CRUD endpoints with Pydantic validation
- HTML report generation via Jinja2 templates
- Swagger UI at `/docs`
- Pytest suite (23 tests, in-memory SQLite)

## Prerequisites

- Python 3.12
- PostgreSQL running from repository root:

```bash
docker compose up -d postgres
```

## Setup

```bash
cd python-service
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
```

## Environment

`.env.example` includes:

- `DATABASE_URL`
- `APP_ENV`
- `APP_PORT`

## Run Migrations (Manual SQL Runner)

Apply pending migrations:

```bash
cd python-service
source .venv/bin/activate
python -m app.db.run_migrations up
```

Roll back the latest migration:

```bash
cd python-service
source .venv/bin/activate
python -m app.db.run_migrations down --steps 1
```

How it works:

- SQL files live in `python-service/db/migrations/`
- A `schema_migrations` table tracks applied filenames
- Up files are applied in sorted filename order (`*.sql` or `*.up.sql`)
- Rollback uses a paired `*.down.sql` file for each applied migration
- Applied migration files are skipped on subsequent runs

## Run Service

```bash
cd python-service
source .venv/bin/activate
python -m uvicorn app.main:app --reload --port 8000
```

Once running, open http://localhost:8000/docs in your browser to access the Swagger UI. All endpoints are interactively testable there - no auth headers required for this service.

## Run Tests

```bash
cd python-service
source .venv/bin/activate
python -m pytest
```

## Project Layout

- `app/main.py`: FastAPI bootstrap and router wiring
- `app/config.py`: environment config
- `app/db/`: SQLAlchemy session management and migration runner
- `db/migrations/`: SQL migration files
- `app/models/`: ORM models
- `app/schemas/`: Pydantic request/response schemas
- `app/services/`: service-layer logic and template helpers
- `app/api/`: route handlers
- `app/templates/`: Jinja templates
- `tests/`: test suite
