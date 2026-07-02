# session-service

Work session CRUD microservice for GigFinance AI.

Owns the `work_sessions` table. Publishes `session.created`, `session.enriched`, and `prediction.requested` Kafka events. Never touches `users`, `expenses`, or any other table.

## Endpoints (API_CONTRACT.md §2)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/sessions` | User JWT | Create a work session |
| GET | `/api/v1/sessions` | User JWT | List sessions (cursor paginated) |
| GET | `/api/v1/sessions/:id` | User JWT | Get single session |
| PATCH | `/api/v1/sessions/:id` | User JWT | Correct earnings/distance/trips |
| DELETE | `/api/v1/sessions/:id` | User JWT | Soft delete |
| PATCH | `/api/v1/sessions/:id/enrichment` | SERVICE_SECRET | Internal: apply enrichment data |
| GET | `/health` | none | Health check |

## Local development

```bash
# 1. Start infrastructure
docker-compose up postgres kafka zookeeper kafka-init -d

# 2. Install deps
npm install

# 3. Configure
cp .env.example .env
# Edit .env: set DATABASE_URL, JWT_PUBLIC_KEY_PATH, SERVICE_SECRET, KAFKA_BROKERS

# 4. Run in dev mode (hot reload)
npm run dev
```

## Run tests

```bash
npm test               # unit tests
npm run test:coverage  # with coverage report
npm run typecheck      # TypeScript type check only
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `JWT_PUBLIC_KEY_PATH` | ✅* | — | Path to RS256 public key PEM file |
| `JWT_PUBLIC_KEY` | ✅* | — | Raw PEM string (alternative to path) |
| `SERVICE_SECRET` | ✅ | — | Shared secret for internal service-to-service auth |
| `KAFKA_BROKERS` | ✅ | `localhost:9092` | Comma-separated Kafka broker list |
| `KAFKA_CLIENT_ID` | — | `session-service` | Kafka client identifier |
| `PORT` | — | `3002` | HTTP listen port |
| `NODE_ENV` | — | `development` | Environment |

*One of `JWT_PUBLIC_KEY_PATH` or `JWT_PUBLIC_KEY` must be set.

## Kafka events published

| Topic | When | Payload type |
|---|---|---|
| `session.created` | After POST /sessions succeeds | `SessionCreatedEvent` |
| `session.enriched` | After PATCH /sessions/:id/enrichment succeeds | `SessionEnrichedEvent` |
| `prediction.requested` | After enrichment applied (trigger for prediction-service) | `PredictionRequestedEvent` |

## ⚠️ Spec gaps

1. **No idempotency key** — duplicate POST requests (e.g. from network retry) will create duplicate sessions. A future improvement would be a client-provided `idempotency_key` field checked against a Redis cache.
2. **No enrichment timeout handling** — sessions stuck in `pending` indefinitely if enrichment-service is down. A future Airflow DAG should move stale `pending` sessions to `failed` after N hours.
