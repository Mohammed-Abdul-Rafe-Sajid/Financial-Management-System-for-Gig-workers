# API_CONTRACT.md
**GigFinance AI — API Contract**

This is the single source of truth for every HTTP endpoint and Kafka event in the system. Field names match `TYPES.ts` and `DB_SCHEMA.sql` exactly (`snake_case`, see `CONVENTIONS.md`).

**When building a service: only implement the section for your service. If you need to call another service, use its documented endpoint here — do not guess its shape.**

---

## §0. Global conventions (read first)

**Base URL pattern:** `https://api.gigfinance.ai/api/v1/...` (or `http://localhost:PORT/api/v1/...` locally)

**Auth header (all endpoints except `/auth/*`, `/health`):**
```
Authorization: Bearer <JWT access token>
```

**Success response shapes:**
```json
// Single resource
{ "data": { ...resource } }

// List (cursor pagination)
{ "data": [ ...resources ], "next_cursor": "eyJpZCI6Ii4uLiJ9" }
```

**Error response shape (always this exact structure):**
```json
{
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Work session with id abc-123 was not found",
    "details": {}
  }
}
```

**Standard error codes** (use exactly these strings):
`VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `SESSION_NOT_FOUND`, `USER_NOT_FOUND`, `OTP_INVALID`, `OTP_EXPIRED`, `RATE_LIMITED`, `INSUFFICIENT_DATA`, `ENRICHMENT_FAILED`, `INTERNAL_ERROR`

## Internal service-to-service auth
All internal endpoints (marked "service-to-service only") require:
  Header: Authorization: Bearer <SERVICE_SECRET>
Where SERVICE_SECRET is the shared env var defined in .env.example.
This is distinct from user JWTs — internal calls use the static secret, not a user token.

---

## §1. user-service

### `POST /api/v1/auth/request-otp`
**Auth:** none
**Request:**
```json
{ "phone_number": "+919876543210" }
```
**Response 200:**
```json
{ "data": { "otp_sent": true, "expires_in_seconds": 300 } }
```
**Errors:** `RATE_LIMITED` (max 5 requests / 15 min / phone number)

---

### `POST /api/v1/auth/verify-otp`
**Auth:** none
**Request:**
```json
{ "phone_number": "+919876543210", "otp": "123456" }
```
**Response 200:**
```json
{
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "expires_in_seconds": 900,
    "user": { "...User object, see TYPES.ts" }
  }
}
```
**Errors:** `OTP_INVALID`, `OTP_EXPIRED`

---

### `POST /api/v1/auth/refresh`
**Auth:** none (refresh token in body)
**Request:** `{ "refresh_token": "eyJ..." }`
**Response 200:** `{ "data": { "access_token": "eyJ...", "expires_in_seconds": 900 } }`

---

### `GET /api/v1/users/me`
**Auth:** required
**Response 200:** `{ "data": { ...User object } }`

---

### `PATCH /api/v1/users/me`
**Auth:** required
**Request (all fields optional):**
```json
{
  "name": "Ravi Kumar",
  "preferred_language": "te",
  "city": "Hyderabad",
  "vehicle_type": "bike",
  "active_platforms": ["rapido", "swiggy"],
  "active_domains": ["ride_hailing", "food_delivery"]
}
```
**Response 200:** `{ "data": { ...updated User object } }`

---

### `GET /api/v1/users/:id` *(internal — for service-to-service calls only, requires service auth token, not user JWT)*
**Response 200:** `{ "data": { ...User object } }`
**Errors:** `USER_NOT_FOUND`

---

## §2. session-service

### `POST /api/v1/sessions`
**Auth:** required
**Request:**
```json
{
  "platform": "rapido",
  "domain": "ride_hailing",
  "session_date": "2026-06-30",
  "start_time": "2026-06-30T08:00:00Z",
  "end_time": "2026-06-30T11:00:00Z",
  "gross_earnings_inr": 450.00,
  "distance_km": 32.5,
  "trips_or_jobs_count": 6,
  "gps_lat": 17.385044,
  "gps_lng": 78.486671
}
```
*Only `platform`, `domain`, `session_date`, `gross_earnings_inr` are strictly required — this is the "minimal manual input" principle from the PRD. Everything else is optional and enrichment-service fills gaps where possible.*

**Response 201:**
```json
{ "data": { ...WorkSession object, enrichment_status: "pending" } }
```
**Side effect:** publishes `session.created` event to Kafka (see §9)

---

### `GET /api/v1/sessions?limit=20&cursor=...&platform=rapido&domain=ride_hailing&from_date=2026-06-01&to_date=2026-06-30`
**Auth:** required
**Response 200:** `{ "data": [ ...WorkSession[] ], "next_cursor": "..." }`

---

### `GET /api/v1/sessions/:id`
**Auth:** required (must own the session)
**Response 200:** `{ "data": { ...WorkSession object } }`
**Errors:** `SESSION_NOT_FOUND`, `FORBIDDEN`

---

### `PATCH /api/v1/sessions/:id`
**Auth:** required (must own the session)
**Request:** any subset of `{ gross_earnings_inr, distance_km, trips_or_jobs_count }` — corrections only, enrichment fields are not user-editable
**Response 200:** `{ "data": { ...updated WorkSession } }`

---

### `DELETE /api/v1/sessions/:id`
**Auth:** required (must own the session) — soft delete only (`CONVENTIONS.md §3`)
**Response 200:** `{ "data": { "deleted": true } }`

---

### `PATCH /api/v1/sessions/:id/enrichment` *(internal — called only by enrichment-service)*
**Auth:** service-to-service token
**Request:** `{ "enrichment_data": { ...EnrichmentData object }, "fuel_cost_inr": 85.50 }`
**Response 200:** `{ "data": { ...updated WorkSession, enrichment_status: "enriched" } }`
**Side effect:** publishes `session.enriched` event to Kafka

---

## §3. enrichment-service

*No public HTTP API. This service is a Kafka consumer that listens to `session.created`, calls external APIs, then calls `PATCH /api/v1/sessions/:id/enrichment` on session-service.*

**External calls made per session:**
1. OpenWeatherMap (current weather by lat/lng or city)
2. Google Maps Geocoding (lat/lng → zone name)
3. Fuel price lookup (by city, daily cached)
4. Holiday calendar lookup (by date)
5. Compute `day_of_week`, `is_weekday`, `week_of_year` locally (no API needed)

**Retry policy:** exponential backoff, 3 attempts. If all fail, set `enrichment_status: "failed"` and still publish `session.enriched` (with partial data) so downstream services aren't blocked indefinitely.

---

## §4. prediction-service

### `POST /api/v1/predictions/earnings`
**Auth:** required
**Request (daily/weekly/monthly/yearly):**
```json
{ "prediction_type": "weekly" }
```
**Request (goal_based):**
```json
{
  "prediction_type": "goal_based",
  "goal": { "target_amount_inr": 10000, "target_period_days": 7, "preferred_platforms": ["rapido", "swiggy"] }
}
```
**Request (scenario):**
```json
{
  "prediction_type": "scenario",
  "scenario": {
    "base_prediction_type": "weekly",
    "changes": { "fuel_price_delta_pct": 0.10, "additional_hours_per_week": 5 }
  }
}
```
**Response 200 (daily/weekly/monthly/yearly):**
```json
{ "data": { ...MlPrediction object, "explanation": { ...PredictionExplanation } } }
```
**Response 200 (goal_based):**
```json
{ "data": { ...GoalBasedPredictionResult, see TYPES.ts } }
```
**Response 200 (scenario):**
```json
{ "data": { ...ScenarioSimulationResult, see TYPES.ts } }
```
**Errors:** `INSUFFICIENT_DATA` (if user has 0 sessions — falls back to pure generic model, this error is only used if even generic model can't run)

---

### `GET /api/v1/predictions/history?prediction_type=weekly&limit=20`
**Auth:** required
**Response 200:** `{ "data": [ ...MlPrediction[] ], "next_cursor": "..." }`

---

### `GET /api/v1/predictions/accuracy` *(internal/admin — for model monitoring)*
**Response 200:** `{ "data": { "mae_inr": 145.20, "rmse_inr": 210.50, "sample_size": 4500 } }`

---

## §5. iss-service

### `GET /api/v1/iss/score`
**Auth:** required
**Response 200:** `{ "data": { ...IncomeStabilityScore object } }`
**Errors:** `INSUFFICIENT_DATA` (if `data_sufficiency_flag` is false — still returns the score but client should show a "preliminary" badge per PRD §10.2)

---

### `GET /api/v1/iss/history?period=6m`
**Auth:** required
**Response 200:** `{ "data": [ { "composite_score": 62.5, "score_band": "good", "computed_at": "2026-06-01T00:00:00Z" }, ... ] }`

---

### `GET /api/v1/iss/report`
**Auth:** required
**Response 200:** binary PDF (`Content-Type: application/pdf`)

---

## §6. expense-service

### `POST /api/v1/expenses`
**Auth:** required
**Request:**
```json
{ "category": "fuel", "amount_inr": 120.00, "description": "Petrol top-up", "expense_date": "2026-06-30", "session_id": null }
```
**Response 201:** `{ "data": { ...Expense object } }`

---

### `GET /api/v1/expenses?category=fuel&from_date=2026-06-01&to_date=2026-06-30&limit=20&cursor=...`
**Auth:** required
**Response 200:** `{ "data": [ ...Expense[] ], "next_cursor": "..." }`

---

### `DELETE /api/v1/expenses/:id`
**Auth:** required (must own) — soft delete
**Response 200:** `{ "data": { "deleted": true } }`

---

## §7. chatbot-service

### `POST /api/v1/chat/message`
**Auth:** required
**Request:** `{ "session_id": "uuid-or-null-for-new-conversation", "content": "Do I need to file ITR if I earn ₹2 lakh per year?" }`
**Response 200:**
```json
{
  "data": {
    "session_id": "...",
    "message": { ...ChatMessage object with role: "assistant" }
  }
}
```

---

### `GET /api/v1/chat/history?session_id=...`
**Auth:** required
**Response 200:** `{ "data": [ ...ChatMessage[] ] }`

---

## §8. scheme-service

### `GET /api/v1/schemes?category=insurance`
**Auth:** required
**Response 200:** `{ "data": [ ...Scheme[] ] }`

---

### `GET /api/v1/schemes/eligible` *(filtered by calling user's profile)*
**Auth:** required
**Response 200:** `{ "data": [ ...Scheme[] ] }` — filtered server-side using `users` data (fetched via user-service API) against each scheme's `eligibility_criteria`

---

### `GET /api/v1/schemes/:id`
**Auth:** required
**Response 200:** `{ "data": { ...Scheme object } }`

---

## §9. Kafka event schemas

| Topic | Producer | Consumer(s) | Payload (see TYPES.ts) |
|---|---|---|---|
| `session.created` | session-service | enrichment-service, prediction-service | `SessionCreatedEvent` |
| `session.enriched` | session-service (after enrichment PATCH) | prediction-service, analytics-service | `SessionEnrichedEvent` |
| `prediction.requested` | session-service, scheduler | prediction-service | `PredictionRequestedEvent` |
| `iss.recompute.requested` | scheduler (Airflow, daily) | iss-service | `{ "user_id": "all" \| string, "timestamp": "..." }` |

**Consumer group naming:** `<service-name>-consumer-group` (e.g. `prediction-service-consumer-group`)

---

## §10. Dashboard/analytics aggregation endpoints (analytics-service)

### `GET /api/v1/dashboard/summary?period=monthly`
**Auth:** required
**Response 200:**
```json
{
  "data": {
    "period": "monthly",
    "total_income_inr": 24500.00,
    "total_expenses_inr": 5200.00,
    "net_income_inr": 19300.00,
    "platform_split": [ { "platform": "rapido", "income_inr": 14000.00, "pct": 0.57 } ],
    "domain_split": [ { "domain": "ride_hailing", "income_inr": 18000.00, "pct": 0.73 } ]
  }
}
```

### `GET /api/v1/dashboard/platform-comparison`
**Response 200:** `{ "data": [ { "platform": "rapido", "avg_earning_per_hour_inr": 145.50, "total_trips": 320, "trend_pct_30d": 0.08 } ] }`

### `GET /api/v1/dashboard/heatmap?platform=rapido`
**Response 200:** `{ "data": [ { "day_of_week": 1, "hour": 8, "avg_earnings_inr": 95.00 } ] }` (168 cells: 7 days × 24 hours)

### `GET /api/v1/dashboard/trends?metric=income&period_days=90`
**Response 200:** `{ "data": [ { "date": "2026-06-01", "value_inr": 850.00 } ] }`

---

## Next service to build? Check off here as each is completed:
- [ ] user-service
- [ ] session-service
- [ ] enrichment-service
- [ ] prediction-service
- [ ] iss-service
- [ ] expense-service
- [ ] chatbot-service
- [ ] scheme-service
- [ ] analytics-service
- [ ] notification-service
- [ ] frontend (web)
