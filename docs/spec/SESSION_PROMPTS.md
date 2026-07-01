# SESSION_PROMPTS.md
**GigFinance AI — Copy-paste prompts for each Claude session/account**

These are the exact prompts to paste at the start of each new Claude conversation.
Upload the 4 spec files alongside the prompt: CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql, API_CONTRACT.md

---

## SESSION 1 — user-service + auth (Node.js / TypeScript)

```
You are building the `user-service` for GigFinance AI.

I am uploading 4 spec files: CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql, API_CONTRACT.md.
Read all 4 fully before writing any code.

Your job (and ONLY your job):
Build the user-service as a Node.js + Express + TypeScript microservice.

Implement exactly these endpoints from API_CONTRACT.md §1:
- POST /api/v1/auth/request-otp
- POST /api/v1/auth/verify-otp
- POST /api/v1/auth/refresh
- GET /api/v1/users/me
- PATCH /api/v1/users/me
- GET /api/v1/users/:id (internal, service-to-service only)
- GET /health

Technical requirements:
- Database: PostgreSQL (use `pg` with parameterized queries — no ORM)
- OTP: generate 6-digit OTP, store in Redis with 5-min TTL, deliver via Twilio (SMS)
- JWT: RS256 signed, access token 15-min expiry, refresh token 7-day expiry stored in Redis
- Rate limiting: 5 OTP requests per phone per 15 min (use Redis counter)
- Validation: use `zod` for all request body validation
- Folder structure: follow CONVENTIONS.md §5 exactly
- Error responses: follow CONVENTIONS.md §3 format exactly
- Write unit tests (Jest) for all service-layer logic
- Write a README.md with setup instructions and env var list

Do NOT build any other service. If you need user data from another service, flag it — don't build that service.

When done, output the complete working code file by file, then list any ⚠️ SPEC GAPs you encountered.
```

---

## SESSION 2 — session-service (Node.js / TypeScript)

```
You are building the `session-service` for GigFinance AI.

I am uploading 4 spec files: CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql, API_CONTRACT.md.
Read all 4 fully before writing any code.

Your job (and ONLY your job):
Build the session-service as a Node.js + Express + TypeScript microservice.

Implement exactly these endpoints from API_CONTRACT.md §2:
- POST /api/v1/sessions
- GET /api/v1/sessions
- GET /api/v1/sessions/:id
- PATCH /api/v1/sessions/:id
- DELETE /api/v1/sessions/:id (soft delete — set deleted_at)
- PATCH /api/v1/sessions/:id/enrichment (internal, service-to-service auth)
- GET /health

Technical requirements:
- Database: PostgreSQL (use `pg` with parameterized queries)
- Auth: validate JWT from Authorization header (use the public RS256 key — do NOT implement auth yourself, just validate)
- After POST /api/v1/sessions succeeds: publish a `session.created` Kafka event (see API_CONTRACT.md §9 and TYPES.ts for payload)
- After PATCH /api/v1/sessions/:id/enrichment succeeds: publish a `session.enriched` Kafka event
- Kafka client: use `kafkajs`
- Pagination: cursor-based (see CONVENTIONS.md §3)
- Computed columns (net_platform_earnings_inr, net_earnings_after_fuel_inr) are database GENERATED columns — do not compute in code
- Validation: use `zod`
- Tests: Jest unit tests for service layer
- README.md with setup and env vars

Do NOT implement authentication logic (OTP, JWT generation) — only validate the JWT.
Do NOT build enrichment-service — just publish the Kafka event.
```

---

## SESSION 3 — enrichment-service (Python)

```
You are building the `enrichment-service` for GigFinance AI.

I am uploading 4 spec files: CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql, API_CONTRACT.md.
Read all 4 fully before writing any code.

Note: TYPES.ts is TypeScript — mirror all types as Pydantic models with identical snake_case field names.

Your job (and ONLY your job):
Build the enrichment-service as a Python service (no HTTP API — this is a Kafka consumer).

What it does:
1. Consumes `session.created` events from Kafka topic (see API_CONTRACT.md §9)
2. For each event, fetches enrichment data from external APIs:
   - OpenWeatherMap API: current weather by (lat, lng) or city name
   - Google Maps Geocoding: (lat, lng) → human-readable zone/area name
   - Fuel price: use a daily-cached Redis lookup (store: `fuel:{city}:{YYYY-MM-DD}` → price_per_litre)
     If no API available, use a hardcoded table of city averages (Hyderabad ₹104, Bengaluru ₹101, Chennai ₹102, Mumbai ₹106, Delhi ₹95) — it will be replaced by a real API later
   - Holiday: check against a hardcoded dict of Indian national holidays + fetch state holidays if possible
   - Compute locally: day_of_week, is_weekday, week_of_year from session_date
3. Assembles an EnrichmentData object (match TYPES.ts exactly)
4. Calls PATCH /api/v1/sessions/:id/enrichment on session-service (internal service-to-service auth)
5. Retry policy: 3 attempts with exponential backoff per external API call
6. If all enrichment fails: still call the PATCH endpoint with whatever partial data was collected, set enrichment_status to "failed"

Technical requirements:
- Kafka consumer: use `aiokafka` (async)
- External HTTP calls: use `httpx` (async)
- Redis: use `redis.asyncio`
- Pydantic v2 for data validation
- Concurrency: process up to 20 sessions in parallel (asyncio semaphore)
- Tests: pytest for enrichment logic (mock external API calls)
- README.md

Do NOT build session-service. Do NOT expose any HTTP endpoints (except GET /health on a small internal port for Kubernetes liveness probe).
```

---

## SESSION 4 — prediction-service (Python / FastAPI / ML)

```
You are building the `prediction-service` for GigFinance AI.

I am uploading 4 spec files: CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql, API_CONTRACT.md.
Read all 4 fully before writing any code.

Note: TYPES.ts is TypeScript — mirror all types as Pydantic v2 models with identical snake_case field names.

Your job (and ONLY your job):
Build the prediction-service as a Python FastAPI service that serves ML predictions.

Implement exactly these endpoints from API_CONTRACT.md §4:
- POST /api/v1/predictions/earnings
- GET /api/v1/predictions/history
- GET /api/v1/predictions/accuracy (internal)
- GET /health

The adaptive weighting formula (CRITICAL — implement exactly this):
  W_personal = min(0.9, n_user_sessions / 180)
  W_generic  = max(0.1, 1 - W_personal)
  prediction = (W_generic × generic_model.predict(X)) + (W_personal × personal_model.predict(X, user_history))

If a user has < 10 personal sessions, personal_model falls back to the generic model (cold start).

ML model layer:
- Generic model: LightGBM regressor, trained on a synthetic dataset (you will generate this in a separate notebook — for now, build the serving layer and load from a pickle/joblib file path set by env var MODEL_GENERIC_PATH)
- Personal model: same LightGBM architecture, per-user fine-tuned. Load from Redis key `model:personal:{user_id}` if exists, else fall back to generic
- For goal_based predictions: use scipy optimize (minimize) to find hours/days that achieve target_amount_inr
- For scenario predictions: hold base features constant, modify the changed features, run inference, return delta

Feature set to build (these must be extracted from the user's session history, fetched via session-service API):
  gross_earnings_inr_rolling_7d, gross_earnings_inr_rolling_30d,
  sessions_count_rolling_7d, sessions_count_rolling_30d,
  day_of_week, is_weekday, is_public_holiday, is_festival_period,
  weather_condition_encoded, temperature_celsius, traffic_index,
  fuel_price_per_litre, platform_encoded, domain_encoded,
  surge_premium_flag (if incentive > 20% of gross), worker_session_count (n_user_sessions),
  personal_weight (W_personal computed above)

SHAP explanations: use shap library, compute top 5 feature contributions per prediction.
Persist each prediction to PostgreSQL ml_predictions table (see DB_SCHEMA.sql).

Technical requirements:
- FastAPI + uvicorn
- Pydantic v2
- joblib for model serialization
- shap, lightgbm, scipy, numpy, pandas
- httpx for calling session-service API
- Tests: pytest with mocked model and mocked session-service
- README.md with env vars and how to load/swap models
```

---

## SESSION 5 — iss-service (Python)

```
You are building the `iss-service` for GigFinance AI.

I am uploading 4 spec files: CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql, API_CONTRACT.md.
Read all 4 fully before writing any code.

Your job (and ONLY your job):
Build the iss-service as a Python FastAPI service.

Implement exactly these endpoints from API_CONTRACT.md §5:
- GET /api/v1/iss/score
- GET /api/v1/iss/history
- GET /api/v1/iss/report (returns PDF)
- GET /health

CRITICAL — implement the ISS algorithm exactly as specified:
  ISS = (0.20 × EFS) + (0.20 × EVS) + (0.20 × ESS) + (0.15 × ETS) + (0.10 × EGS) + (0.10 × PDS) + (0.05 × XSS)

  EFS (Earning Frequency Score 0-100):
    actual_working_days_90d / expected_working_days_90d × 100
    expected = 65 (5 days/week × 13 weeks)
    cap at 100.

  EVS (Earning Volume Score 0-100):
    Normalize avg_monthly_net_earnings against living_wage_benchmark for user's city:
    Benchmarks: Hyderabad ₹18000, Bengaluru ₹20000, Mumbai ₹22000, Chennai ₹18000, Delhi ₹19000, others ₹16000
    EVS = min(100, (avg_monthly_earnings / benchmark) × 100)

  ESS (Earning Stability Score 0-100):
    CV = std(monthly_earnings_6m) / mean(monthly_earnings_6m)
    ESS = 100 / (1 + CV)  -- higher CV = lower ESS

  ETS (Earning Trend Score 0-100):
    Fit linear regression on 6 monthly earnings values.
    slope_pct = slope / mean(monthly_earnings_6m)
    ETS = 50 + (slope_pct × 500)  -- normalize so flat=50, +10%/mo=100, -10%/mo=0
    Clamp to [0, 100].

  EGS (Earning Gap Score 0-100):
    longest_gap_days = max consecutive days without a session in past 90 days
    EGS = max(0, 100 - (longest_gap_days × 5))  -- every day gap costs 5 points

  PDS (Platform Diversity Score 0-100):
    proportions = income per platform / total income (past 90 days)
    entropy = -sum(p × log(p)) for each platform with p > 0
    max_entropy = log(number_of_active_platforms)
    PDS = (entropy / max_entropy × 100) if max_entropy > 0 else 0

  XSS (Expense Stability Score 0-100):
    CV_expense = std(monthly_expenses_3m) / mean(monthly_expenses_3m)
    XSS = 100 / (1 + CV_expense)
    If no expense data: XSS = 50 (neutral).

Score bands: 0-25 poor, 26-50 fair, 51-75 good, 76-100 excellent.
Minimum sessions for data_sufficiency_flag = True: 30.

Data sources:
- Fetch work_sessions via GET /api/v1/sessions on session-service (call with service-to-service token)
- Fetch expenses via GET /api/v1/expenses on expense-service
- Save result to income_stability_scores table (upsert on user_id)
- Also insert a row in iss_score_history

PDF report: use reportlab library. Include: score gauge, component breakdown table, "what this means" explanation, "how to improve" tips, disclaimer.

Technical requirements:
- FastAPI + uvicorn, Pydantic v2
- numpy, scipy (for linear regression)
- reportlab (PDF generation)
- Tests: pytest, test each component score formula independently with known inputs/outputs
- README.md
```

---

## SESSION 6 — expense-service (Node.js / TypeScript)

```
You are building the `expense-service` for GigFinance AI.

I am uploading 4 spec files: CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql, API_CONTRACT.md.
Read all 4 fully before writing any code.

Your job (and ONLY your job):
Build the expense-service as a Node.js + Express + TypeScript microservice.

Implement exactly these endpoints from API_CONTRACT.md §6:
- POST /api/v1/expenses
- GET /api/v1/expenses (with filters and cursor pagination)
- DELETE /api/v1/expenses/:id (soft delete)
- GET /health

Technical requirements:
- PostgreSQL with `pg` (no ORM, parameterized queries)
- JWT validation (same as session-service — validate only, RS256 public key)
- Zod validation
- Cursor pagination
- Tests: Jest
- README.md
```

---

## SESSION 7 — chatbot-service (Python / FastAPI / RAG)

```
You are building the `chatbot-service` for GigFinance AI.

I am uploading 4 spec files: CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql, API_CONTRACT.md.
Read all 4 fully before writing any code.

Your job (and ONLY your job):
Build the chatbot-service as a Python FastAPI service implementing a RAG-powered financial guidance chatbot.

Implement exactly these endpoints from API_CONTRACT.md §7:
- POST /api/v1/chat/message
- GET /api/v1/chat/history
- GET /health

Architecture:
1. Language detection: use `langdetect` library on incoming message
2. Query embedding: use `sentence-transformers` with model `all-MiniLM-L6-v2`
3. Vector retrieval: query Pinecone index `gigfinance-knowledge-base` for top 5 chunks, filter by language namespace
4. Re-ranking: use cross-encoder `cross-encoder/ms-marco-MiniLM-L-6-v2` to re-rank retrieved chunks
5. LLM call: Anthropic Claude API (`claude-sonnet-4-6` model)
   System prompt: "You are a financial guidance assistant for Indian gig workers. Answer only based on the provided context. Always cite the source URL. If the context doesn't answer the question, say so honestly — never guess. Respond in {user_language}. Keep answers simple and practical."
6. Post-process: extract source URLs from response, format as sources array (see ChatMessage in TYPES.ts)
7. Persist conversation to MongoDB `chat_sessions` collection (schema in DB_SCHEMA.sql bottom section)

Knowledge base seeding (separate script, not the main service):
- Write a script `scripts/seed_knowledge_base.py` that:
  - Reads a JSON file of pre-curated government document chunks (you will create a sample `data/knowledge_chunks.json` with 20 real chunks about ITR-4, PMSBY, e-Shram, 44AD taxation)
  - Embeds each chunk
  - Upserts into Pinecone

Safety rules in system prompt:
- Never recommend specific investment products by name
- Never give a definitive answer about a user's personal tax liability — always say "consult a CA for your specific situation"
- Always cite source

Technical requirements:
- FastAPI, Pydantic v2
- sentence-transformers, pinecone-client, anthropic, langdetect, pymongo
- Tests: pytest, mock Pinecone and Anthropic API calls
- README.md with Pinecone setup instructions and env vars
```

---

## SESSION 8 — analytics-service (Python)

```
You are building the `analytics-service` for GigFinance AI.

I am uploading 4 spec files: CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql, API_CONTRACT.md.
Read all 4 fully before writing any code.

Your job (and ONLY your job):
Build the analytics-service as a Python FastAPI service.

Implement exactly these endpoints from API_CONTRACT.md §10:
- GET /api/v1/dashboard/summary?period=daily|weekly|monthly|yearly
- GET /api/v1/dashboard/platform-comparison
- GET /api/v1/dashboard/heatmap?platform=...
- GET /api/v1/dashboard/trends?metric=income|expenses|net_income&period_days=30|90|365
- GET /health

Data strategy:
- Source: PostgreSQL work_sessions and expenses tables (read-only access — this service reads, but does not write to these tables which are owned by other services, and that is the only exception to the cross-service DB rule because OLAP queries across services' tables are needed for analytics — document this explicitly in README)
- Caching: Redis. Cache key format: `analytics:{user_id}:{endpoint}:{params_hash}`. TTL: 5 minutes for live dashboard, 1 hour for historical trends. Invalidate on `session.enriched` Kafka event.
- Consume `session.enriched` Kafka events to invalidate user's cached analytics.

SQL queries must be written as raw parameterized queries (use asyncpg).
Use EXPLAIN ANALYZE to verify all queries use the indexes defined in DB_SCHEMA.sql.

Technical requirements:
- FastAPI, asyncpg, redis.asyncio, aiokafka
- Tests: pytest with fixtures seeding test data into a test PostgreSQL instance
- README.md
```

---

## SESSION 9 — Frontend (Next.js / React)

```
You are building the frontend for GigFinance AI.

I am uploading 4 spec files: CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql, API_CONTRACT.md.
Read all 4 fully before writing any code.

Your job (and ONLY your job):
Build the Next.js 14 (App Router) frontend. All API calls go to the API Gateway at the base URL set by env var NEXT_PUBLIC_API_URL. Do not talk to services directly.

Tech stack:
- Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Zustand for auth state, React Query (TanStack) for all server state
- Recharts for charts, React Hook Form + Zod for forms
- i18next for internationalization (6 languages: en, hi, te, ta, kn, mr)

Folder structure: follow CONVENTIONS.md §5 (frontend variant).

Build these pages/sections in priority order:
1. Onboarding: phone number OTP login, profile setup wizard (language, city, platforms, vehicle type)
2. Session Logger: the most important screen — minimal input form (earnings, distance, platform dropdown), shows enrichment status, displays net-after-fuel immediately
3. Dashboard: summary cards (total income, expenses, net income), platform split pie chart, 30-day trend line chart, AI insight card (rotating tips from prediction-service)
4. Predictions: tabs for daily/weekly/monthly, goal-based simulator form (input target → shows required hours/platform/time slots), scenario simulator
5. ISS Score: gauge chart (0-100), component breakdown bars, historical trend, download report button
6. Expenses: log form, category breakdown chart, trend
7. Chatbot: full-screen chat UI, source citations shown below each answer, language selector
8. Schemes: card grid, eligibility filter, application steps modal

Design requirements:
- Mobile-first (375px base width)
- Minimum 44px touch targets
- All money values displayed as ₹X,XX,XXX.XX (Indian number format)
- Skeleton loaders for all async content
- Dark mode support via Tailwind dark: classes
- Each page must handle: loading state, error state, empty state

Use TYPES.ts for all TypeScript types — do not redefine them locally.
Import shared types as: import type { WorkSession, User } from '@/types' (copy TYPES.ts into src/types/index.ts)
```

---

## SESSION 10 — Docker Compose + API Gateway + README

```
You are setting up the infrastructure layer for GigFinance AI.

I am uploading 4 spec files: CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql, API_CONTRACT.md.
Read all 4 fully before writing any code.

Your job (and ONLY your job):
1. docker-compose.yml — single file that spins up the entire local dev environment:
   Services to include:
   - postgres (postgres:16, runs DB_SCHEMA.sql on init, port 5432)
   - mongodb (mongo:7, port 27017)
   - redis (redis:7-alpine, port 6379)
   - kafka + zookeeper (confluentinc/cp-kafka:7.6, port 9092 external / 29092 internal)
   - user-service (build from ./apps/user-service, port 3001)
   - session-service (build from ./apps/session-service, port 3002)
   - enrichment-service (build from ./apps/enrichment-service, port 3003 health only)
   - prediction-service (build from ./apps/prediction-service, port 8001)
   - iss-service (build from ./apps/iss-service, port 8002)
   - expense-service (build from ./apps/expense-service, port 3004)
   - chatbot-service (build from ./apps/chatbot-service, port 8003)
   - analytics-service (build from ./apps/analytics-service, port 8004)
   - api-gateway (build from ./apps/api-gateway, port 3000) — built last, depends on all services
   - web (build from ./apps/web, port 3100)

2. api-gateway (Node.js + Express):
   Single responsibility: JWT validation + request routing to downstream services.
   Routes: /api/v1/auth/* → user-service:3001, /api/v1/users/* → user-service:3001, /api/v1/sessions/* → session-service:3002, /api/v1/expenses/* → expense-service:3004, /api/v1/predictions/* → prediction-service:8001, /api/v1/iss/* → iss-service:8002, /api/v1/chat/* → chatbot-service:8003, /api/v1/dashboard/* → analytics-service:8004, /api/v1/schemes/* → analytics-service:8004 (scheme-service is small — serve from analytics for now or add separately)
   Middleware: cors, rate limiting (express-rate-limit with Redis store), request logging (morgan), JWT verification on all non-auth routes, request ID injection (x-request-id header propagated to all downstream calls)
   Health check: GET /health aggregates all downstream /health responses.

3. Root README.md:
   Complete setup guide: prerequisites, `docker-compose up` instructions, how to run each service individually, env var reference table for every service, how to run the synthetic data generator, how to seed the Pinecone knowledge base, how to run all tests.

4. .env.example at root with every required environment variable.
```
