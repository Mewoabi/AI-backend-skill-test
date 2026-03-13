# Implementation Notes

## Part A - Python Service (Briefing Report Generator)

### Design Decisions

**Single `briefing_points` table with a `type` column**
Rather than using separate `key_points` and `risks` tables, both point types are stored in a single `briefing_points` table with a `type` column constrained to `key_point` or `risk`. This follows the schema hint in the task (`briefing_points`) and keeps the relational model simple - the formatter layer handles grouping and sorting at read time.

**`display_order` on briefing points**
Insertion order is preserved via a `display_order` integer (set to the array index during creation). This ensures the report renders items in the analyst's original sequence regardless of DB retrieval order.

**`generated_at` as status indicator**
Rather than a separate `status` enum column on `briefings`, a nullable `generated_at` timestamp serves as both the "has been generated" flag and the report timestamp. `null` means draft; any non-null value means generated. This reduces schema complexity while conveying the same information.

**`html_content` stored on the briefing record**
The rendered HTML is persisted on the `briefings` row itself. The alternative (re-rendering on every `GET /html` request) would work fine but would recompute on every call. Storing it keeps the GET fast and makes the generated state inspectable via SQL.

**Re-generation allowed**
`POST /briefings/{id}/generate` can be called multiple times. Each call overwrites `html_content` and refreshes `generated_at`. This is intentional - if the template or formatter logic changes, a quick re-generate updates the output without touching stored data.

**Separation of concerns**
- Route handlers contain only HTTP-layer logic (extracting inputs, returning responses, raising 404s).
- `briefing_service.py` owns all DB interactions.
- `ReportFormatter` transforms DB records into a view model and delegates rendering to Jinja2.
- The template contains zero business logic.

### Schema Decisions

| Decision | Rationale |
|----------|-----------|
| `UNIQUE(briefing_id, name)` on metrics | Enforces uniqueness at DB level as a backup to Pydantic validation |
| `ON DELETE CASCADE` on child tables | Deleting a briefing removes all associated points/metrics automatically |
| Indexes on all FK columns | Ensures join/filter queries on `briefing_id` don't require full table scans |
| `TEXT` for `summary`, `recommendation`, `content` | No practical length limit; avoids truncation for long analyst notes |

### Testing Approach

Tests use an in-memory SQLite database via `sqlalchemy`'s `sqlite+pysqlite:///:memory:` connection.  The `get_db` FastAPI dependency is overridden in `conftest.py` so each test gets a fresh, isolated database schema without touching PostgreSQL.

---

## Part B - TypeScript Service (Candidate Document Intake + Summary)

### Design Decisions

**Header-based authentication (assumption)**
Authentication is implemented using two request headers: `x-user-id` and `x-workspace-id`. A `FakeAuthGuard` validates that both are present and attaches them to the request context as an `AuthUser` object. This is intentionally simple - the goal is to demonstrate workspace isolation boundaries (a recruiter in workspace A cannot see candidates in workspace B) without introducing a full auth stack such as JWTs or sessions. This follows the pattern already established in the starter's `src/auth/` directory.

**`verifyCandidateAccess` as the single access control gate**
Every service method that touches candidate data starts with `verifyCandidateAccess(candidateId, workspaceId)`. This centralises the workspace-scoping check in one place, avoiding duplication and making it easy to audit. It also means that even if a candidateId is guessed correctly, it will still return a 404 unless the requesting workspace actually owns it.

**In-memory queue with `setImmediate` dispatch**
The existing `QueueService` was enhanced minimally - a `processors` map and a `registerProcessor` method were added. When a job is enqueued, `setImmediate` schedules the processor to run after the current event loop tick. This gives the HTTP response a chance to return first while still executing the job in the same process.

This approach satisfies the "asynchronous, via queue/worker" requirement without introducing an external dependency (Redis/BullMQ). The trade-off is that jobs are not durable - a process restart loses any queued jobs.

**Built on the starter sample module**
The `CandidatesModule` was built directly on top of the existing `src/sample/` module provided in the starter. `SampleCandidate` is used as the base candidate entity (the candidates the recruiter uploads documents for), `SampleService.ensureWorkspace` established the pattern for auto-creating workspace records on first use, and the `FakeAuthGuard` wiring from the sample controller was reused as-is. This kept the implementation within the existing structure rather than introducing a parallel architecture.

**Deduplication guard in `requestSummaryGeneration`**
Before creating a new pending summary, the service checks for an existing `status='pending'` summary for the same candidate. If one exists, it is returned instead of creating a duplicate. This prevents double-queuing if the endpoint is called twice before the worker finishes.

**Conditional Gemini / Fake provider selection**
`LlmModule` resolves the active `SUMMARIZATION_PROVIDER` at startup based on whether `GEMINI_API_KEY` is set. This means:
- Production/local dev with a key: real Gemini API calls
- Tests (no key set): `FakeSummarizationProvider` with zero external calls
- Local dev without a key: `FakeSummarizationProvider` (safe fallback)

**LLM output validation**
The `validateSummaryResult` helper runs on every LLM response before it is persisted. If the model returns a malformed JSON shape (wrong types, missing fields, invalid enum), the summary is marked `failed` with a descriptive `errorMessage` rather than silently storing bad data.

**`provider` and `promptVersion` on summaries**
Each completed summary records which provider produced it and which prompt version was used. This makes it possible to identify which summaries need re-evaluation if a prompt is updated.

### Schema Decisions

| Decision | Rationale |
|----------|-----------|
| `jsonb` for `strengths` and `concerns` | Native PostgreSQL array storage with full query support; avoids a separate join table for what are effectively display-only arrays |
| Separate `status` index | Worker and API queries filter by status; the index makes these efficient |
| `updated_at` via `@UpdateDateColumn` | Automatically reflects the last state transition without manual update calls |
| `varchar(64)` PKs (UUID strings) | Consistent with the existing `sample_candidates` pattern; avoids auto-increment fragmentation across distributed inserts |
| `ON DELETE CASCADE` on both document and summary FK | Removing a candidate cleans up all associated data automatically |

### LLM Provider

- **Provider used:** Google Gemini (`gemini-2.0-flash`)
- **SDK:** `@google/generative-ai`
- **Configuration:** Set `GEMINI_API_KEY` in `ts-service/.env`
- **Free API key:** https://aistudio.google.com/apikey
- **Structured output:** `responseMimeType: "application/json"` instructs the model to return valid JSON, reducing hallucinated formatting

### Testing Approach

Unit tests mock all repository methods and the `QueueService`. The `FakeSummarizationProvider` is used directly (not mocked) in worker tests - it is the intended test double. This ensures that the worker's control flow and error handling are tested against a realistic provider interface.

---

## What Would Be Improved With More Time

### Part A

1. **Pagination on `GET /briefings`** - currently returns all; add cursor-based pagination for large datasets
2. **Soft delete** - add `deleted_at` to briefings so records can be archived rather than hard-deleted
3. **Async rendering** - for very large briefings, generation could be offloaded to a background task using FastAPI's `BackgroundTasks`
4. **`ETag` / caching headers** on `GET /html` - allows clients to cache the rendered report

### Part B

1. **Persistent queue** - replace the in-memory queue with BullMQ + Redis for job durability across restarts
2. **Retry with exponential backoff** - transient Gemini rate-limit errors should be retried rather than immediately failing
3. **Document chunking** - very long documents exceed Gemini's context window; chunking + summarisation-of-summaries would handle this
4. **Response serialisation** - use `ClassSerializerInterceptor` with `@Exclude()` on `rawText` in list responses to avoid returning large payloads unnecessarily
5. **E2E tests** - full flow tests against a real test database using `supertest` and a separate test schema
