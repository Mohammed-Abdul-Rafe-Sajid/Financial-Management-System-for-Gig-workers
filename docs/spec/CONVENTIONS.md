# CONVENTIONS.md
**GigFinance AI — Engineering Conventions**
*This file is law. Every Claude session, every service, every file must follow this. If something here conflicts with a "best practice" you know, follow this file instead — consistency across services matters more than local optimality.*

---

## 0. Before you write any code

Read these files in this order:
1. `CONVENTIONS.md` (this file)
2. `TYPES.ts` (shared data shapes)
3. `DB_SCHEMA.sql` (database tables)
4. `API_CONTRACT.md` (endpoints relevant to your assigned service)

Do not invent new field names, new endpoints, or new conventions. If something you need isn't covered, **stop and ask the user** rather than guessing. Flag it clearly: `⚠️ SPEC GAP: <description>`.

---

## 1. Naming conventions

| Context | Style | Example |
|---|---|---|
| Database tables/columns | `snake_case` | `work_sessions`, `gross_earnings_inr` |
| JSON API fields (request/response) | `snake_case` | `{"gross_earnings_inr": 450.00}` |
| TypeScript types/interfaces | `PascalCase` | `WorkSession`, `IncomeStabilityScore` |
| TypeScript variables/functions | `camelCase` | `getSessionById`, `userId` |
| Python variables/functions | `snake_case` | `get_session_by_id`, `user_id` |
| Python classes | `PascalCase` | `SessionRepository` |
| React components | `PascalCase` | `EarningsCard.tsx` |
| React hooks | `camelCase`, prefixed `use` | `useDashboard.ts` |
| Environment variables | `SCREAMING_SNAKE_CASE` | `DATABASE_URL`, `JWT_SECRET` |
| Service folder names | `kebab-case` | `prediction-service` |
| Git branches | `kebab-case`, prefixed by type | `feat/session-logging`, `fix/iss-rounding` |
| Kafka topics | `dot.case` | `session.created`, `prediction.requested` |

**Rule: API JSON is always `snake_case`, even though TypeScript/JS code is `camelCase`.** Convert at the API boundary (one mapping layer), not ad hoc throughout the codebase.

---

## 2. Currency, dates, and units — non-negotiable

- All money values: **DECIMAL, stored and transmitted in INR, 2 decimal places.** Field names always suffixed `_inr` (e.g. `net_earnings_after_fuel_inr`). Never use floats for money in code — use a decimal library (`decimal.js` in TS, `Decimal` in Python).
- All dates: **ISO 8601** (`YYYY-MM-DD` for dates, `YYYY-MM-DDTHH:mm:ssZ` for timestamps). Always UTC in storage; convert to IST (`Asia/Kolkata`) only at display layer.
- All distances: **kilometers**, field suffix `_km`.
- All durations: **hours as decimal**, field suffix `_hours` (e.g. `1.5` = 1 hour 30 min).
- All percentages: **decimal 0–1, not 0–100**, field suffix `_pct` (e.g. `platform_commission_pct: 0.22` = 22%).
- IDs: **UUID v4** for all primary keys, as strings. Never auto-increment integers for anything user-facing.

---

## 3. API design rules

- Base path: `/api/v1/...` — version is in the URL, not headers.
- Methods: `GET` (read), `POST` (create), `PATCH` (partial update), `DELETE` (soft-delete only — never hard-delete user financial data; set `deleted_at`).
- Auth: every endpoint except `/auth/*` and `/health` requires `Authorization: Bearer <JWT>`.
- Pagination: cursor-based, query params `?limit=20&cursor=<opaque>`. Response includes `next_cursor: string | null`.
- Errors: always this exact shape (see `API_CONTRACT.md` §0 for full spec):
  ```json
  { "error": { "code": "SESSION_NOT_FOUND", "message": "Human-readable message", "details": {} } }
  ```
- Success responses: always wrapped as `{ "data": {...} }` for single resources, `{ "data": [...], "next_cursor": "..." }` for lists.
- HTTP status codes: `200` OK, `201` Created, `400` validation error, `401` unauthenticated, `403` forbidden, `404` not found, `409` conflict, `422` semantic validation failure, `429` rate limited, `500` server error.

---

## 4. Service boundaries — do not cross these

Each service owns its own data. **No service reads another service's database directly.** All cross-service communication is either:
- Synchronous: HTTP/REST call to the other service's public API (never direct DB connection)
- Asynchronous: Kafka event (see `API_CONTRACT.md` §9 for event schemas)

| Service | Owns these tables | Never touches |
|---|---|---|
| `user-service` | `users` | sessions, predictions, expenses |
| `session-service` | `work_sessions` | users (reads via API only) |
| `enrichment-service` | (writes `enrichment_data` JSONB on work_sessions via session-service API, not direct DB) | — |
| `prediction-service` | `ml_predictions` | work_sessions (reads via API/feature store only) |
| `iss-service` | `income_stability_scores` | — |
| `expense-service` | `expenses` | — |
| `chatbot-service` | chat sessions (MongoDB) | all SQL tables |
| `scheme-service` | `schemes` | — |

If you're building one service and think you need another service's table directly — **you don't. Call its API.** This is the single most important rule for avoiding integration conflicts between sessions built independently.

---

## 5. Folder structure (every service follows this internally)

**Node.js/TypeScript service:**
```
service-name/
├── src/
│   ├── routes/        # Express route handlers (thin — call controllers)
│   ├── controllers/   # Request/response handling, calls services
│   ├── services/       # Business logic
│   ├── repositories/   # DB access layer only
│   ├── types/          # Service-local types (import shared from packages/shared-types)
│   ├── middleware/      # auth, validation, error handling
│   ├── events/          # Kafka producers/consumers
│   └── index.ts
├── tests/
├── Dockerfile
├── package.json
└── .env.example
```

**Python/FastAPI service:**
```
service-name/
├── app/
│   ├── routers/        # FastAPI route handlers
│   ├── services/        # Business logic
│   ├── repositories/    # DB access layer
│   ├── schemas/          # Pydantic models (mirror TYPES.ts shapes)
│   ├── models/            # ML model loading/inference (if applicable)
│   └── main.py
├── tests/
├── Dockerfile
├── requirements.txt
└── .env.example
```

**Do not deviate from this structure.** A session building `expense-service` and a session building `prediction-service` should produce folder trees that look identical in shape.

---

## 6. Error handling pattern (all languages)

- Never swallow errors silently.
- Always log with structured context: `{ service, error_code, user_id (if available), trace_id }`.
- User-facing error messages must never leak stack traces, SQL, or internal paths.
- Every service exposes `GET /health` returning `{ "status": "ok", "service": "session-service", "version": "1.0.0" }`.

---

## 7. Testing requirement (minimum bar for any session's output)

Before considering a service "done," it must have:
- Unit tests for all business logic in `services/`
- At least one integration test per endpoint (happy path)
- A `README.md` in the service folder explaining: what it does, how to run it locally, env vars required

---

## 8. Git/commit conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- One service per branch/PR when working across sessions — never let two sessions edit the same service folder in parallel without merging.

---

## 9. What every new Claude session should be told (copy-paste this)

```
You are building [SERVICE NAME] for the GigFinance AI project.

Read these files first, in order: CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql,
then the section of API_CONTRACT.md relevant to [SERVICE NAME].

Rules:
- Follow CONVENTIONS.md exactly — naming, folder structure, error format, etc.
- Only touch the database tables this service owns (see CONVENTIONS.md §4).
- Talk to other services only via their public API or Kafka events — never their DB.
- If you need something not covered in the contract files, STOP and ask
  rather than inventing a new convention or field name.
- Build only this one service. Do not attempt to build other services
  or modify the shared contract files.
```
