# TalentFlow TypeScript Service

NestJS service for the backend assessment.

This service includes:

- Nest bootstrap with global validation
- TypeORM + migration setup
- Fake auth context (`x-user-id`, `x-workspace-id`)
- Workspace-scoped candidate module with document upload and summary generation
- Async queue/worker flow for background LLM processing
- Google Gemini integration with a fake provider fallback
- Swagger UI at `/docs`
- Jest unit tests

## Prerequisites

- Node.js 22+
- npm
- PostgreSQL running from repository root:

```bash
docker compose up -d postgres
```

## Setup

```bash
cd ts-service
npm install
cp .env.example .env
```

## Environment

- `PORT`
- `DATABASE_URL`
- `NODE_ENV`
- `GEMINI_API_KEY` (optional - leave blank to use the fake provider for local dev and tests)

Do not commit API keys or secrets. A free key can be obtained from Google AI Studio (https://aistudio.google.com/apikey).

## Run Migrations

```bash
cd ts-service
npm run migration:run
```

## Run Service

```bash
cd ts-service
npm run start:dev
```

Once running, open http://localhost:3000/docs in your browser to access the Swagger UI. Click **Authorize** (top right), enter values for `x-user-id` and `x-workspace-id` (e.g. `user-1` / `workspace-1`), and all subsequent requests will include those headers automatically.

## Run Tests

```bash
cd ts-service
npm test
npm run test:e2e
```

## Fake Auth Headers

Sample endpoints in this starter are protected by a fake local auth guard.
Include these headers in requests:

- `x-user-id`: any non-empty string (example: `user-1`)
- `x-workspace-id`: workspace identifier used for scoping (example: `workspace-1`)

## Layout Highlights

- `src/auth/`: fake auth guard, user decorator, auth types
- `src/entities/`: starter entities
- `src/sample/`: tiny example module (controller/service/dto)
- `src/queue/`: in-memory queue abstraction
- `src/llm/`: provider interface + fake provider
- `src/migrations/`: TypeORM migration files
