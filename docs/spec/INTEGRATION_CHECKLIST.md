# INTEGRATION_CHECKLIST.md
**GigFinance AI — Integration Checklist**

Use this after each service is built, before declaring it "done." Run through this list yourself (not Claude) — or paste the relevant section into a new Claude session specifically for integration testing.

---

## How to run integration checks

For each check below that says "test manually":
1. Start the full stack: `docker-compose up`
2. Run the curl command shown
3. Verify the response matches the expected shape in `API_CONTRACT.md`

---

## Checklist: user-service

- [ ] `POST /api/v1/auth/request-otp` with a valid phone number returns `{ data: { otp_sent: true } }`
- [ ] `POST /api/v1/auth/verify-otp` with correct OTP returns JWT and a User object matching `TYPES.ts`
- [ ] JWT from verify-otp is accepted by `GET /api/v1/users/me`
- [ ] `PATCH /api/v1/users/me` with `{ "active_platforms": ["rapido", "swiggy"] }` updates correctly and is reflected in the next GET
- [ ] Expired/invalid JWT returns `{ error: { code: "UNAUTHENTICATED" } }` (not a 500)
- [ ] OTP rate limit (5 requests / 15 min) triggers `RATE_LIMITED` on the 6th attempt
- [ ] `/health` returns `{ status: "ok", service: "user-service" }`

---

## Checklist: session-service

- [ ] `POST /api/v1/sessions` with minimal fields (platform, domain, session_date, gross_earnings_inr) succeeds and returns `enrichment_status: "pending"`
- [ ] The response includes computed `net_platform_earnings_inr` (verify: it equals gross - commission + incentive)
- [ ] Verify a `session.created` Kafka event was published: consume from the topic and check the payload matches `SessionCreatedEvent` in `TYPES.ts`
- [ ] `GET /api/v1/sessions` returns a list with cursor pagination (check `next_cursor` field present)
- [ ] `GET /api/v1/sessions/:id` returns `FORBIDDEN` when accessed with a different user's JWT
- [ ] `DELETE /api/v1/sessions/:id` sets `deleted_at` (soft delete) — verify the record still exists in DB with `deleted_at` set, and the deleted session does NOT appear in GET list results

---

## Checklist: enrichment-service

- [ ] After a session is created (and `session.created` event fires), wait 10 seconds and then `GET /api/v1/sessions/:id` — verify `enrichment_status` is now `"enriched"` and `enrichment_data` is populated
- [ ] `enrichment_data` object has all required fields: `weather_condition`, `temperature_celsius`, `is_public_holiday`, `is_weekday`, `day_of_week`, `week_of_year`, `enriched_at`
- [ ] Simulate enrichment failure (take down OpenWeatherMap mock): verify `enrichment_status` becomes `"failed"` (not stuck on `"pending"`)

---

## Checklist: prediction-service

- [ ] `POST /api/v1/predictions/earnings` with `{ "prediction_type": "daily" }` returns a prediction with all fields from `MlPrediction` in `TYPES.ts`
- [ ] `confidence_interval_lower_inr` < `predicted_value_inr` < `confidence_interval_upper_inr` (sanity check)
- [ ] `personal_weight_used` is between 0.1 and 0.9 (check formula: new user with 0 sessions should return 0.1)
- [ ] `explanation.top_factors` has at least 3 entries and each has a `human_readable` string in the user's language
- [ ] `POST` with `{ "prediction_type": "goal_based", "goal": { "target_amount_inr": 10000, "target_period_days": 7 } }` returns `GoalBasedPredictionResult` shape
- [ ] Prediction is saved to `ml_predictions` table in PostgreSQL (check directly)

---

## Checklist: iss-service

- [ ] `GET /api/v1/iss/score` for a user with < 30 sessions returns `data_sufficiency_flag: false` but still returns a score (no error)
- [ ] `GET /api/v1/iss/score` for a user with ≥ 30 sessions returns `data_sufficiency_flag: true`
- [ ] `composite_score` equals the weighted sum of component scores to within 0.01 (verify math manually)
- [ ] `score_band` matches the range: 0-25=poor, 26-50=fair, 51-75=good, 76-100=excellent
- [ ] `GET /api/v1/iss/history` returns an array (may be empty for new user)
- [ ] `GET /api/v1/iss/report` returns a PDF (Content-Type: application/pdf, non-zero file size)
- [ ] After triggering a score recompute, check `iss_score_history` table has a new row

---

## Checklist: expense-service

- [ ] `POST /api/v1/expenses` creates expense and it appears in GET list
- [ ] `DELETE /api/v1/expenses/:id` soft-deletes (deleted record gone from GET list, still in DB)
- [ ] Filtering by `category=fuel` only returns fuel expenses
- [ ] Expense with a `session_id` links correctly to a work session (foreign key doesn't error)

---

## Checklist: chatbot-service

- [ ] `POST /api/v1/chat/message` with `{ "session_id": null, "content": "Do I need to file ITR if I earn ₹2 lakh from Swiggy?" }` returns an assistant message
- [ ] Response includes `sources` array with at least one source object `{ title, url }` (not null)
- [ ] A second message with the same `session_id` from step 1 maintains conversation context
- [ ] `GET /api/v1/chat/history?session_id=...` returns both the user message and assistant reply
- [ ] A nonsense query ("what is the weather in Mars?") returns a response saying it can't help with that (not a 500, not a hallucinated answer)

---

## Checklist: analytics-service

- [ ] `GET /api/v1/dashboard/summary?period=monthly` returns correct total: manually sum the user's sessions for the month and compare
- [ ] `GET /api/v1/dashboard/heatmap` returns exactly 168 cells (7 × 24) or fewer if some hour/day combos have no data
- [ ] `GET /api/v1/dashboard/trends?metric=income&period_days=30` returns one data point per day (up to 30)
- [ ] Cache invalidation: post a new session, wait for enrichment, then call the dashboard — verify numbers update (check Redis TTL isn't serving stale data)

---

## Checklist: api-gateway + end-to-end

- [ ] All endpoints work through the gateway on port 3000 (not direct service ports)
- [ ] `GET /health` on the gateway returns an aggregated view of all services' health
- [ ] A request without JWT to any non-auth endpoint returns 401 from the gateway (not forwarded)
- [ ] `x-request-id` header is generated by the gateway and appears in downstream service logs

---

## Cross-service data consistency checks

- [ ] Create a session → enrichment runs → check that `analytics-service` /dashboard/summary reflects the new earnings
- [ ] Create 30 sessions → call `GET /api/v1/iss/score` → `data_sufficiency_flag` is now true → `composite_score` is non-zero
- [ ] Create a session → verify `session.created` Kafka event → verify `session.enriched` Kafka event fires after enrichment → verify `prediction.requested` event fires (consumed by prediction-service to update feature store)

---

## How to handle a spec gap found during integration

If a service was built with something that doesn't match `API_CONTRACT.md` (e.g. different field name, different error code):

**Fix in the service, not in the contract.** The contract is the source of truth.

If the contract itself needs updating (genuine spec gap), update `API_CONTRACT.md` first, then update all affected services. Do this in one focused Claude session that gets shown the current `API_CONTRACT.md` and the specific gap.

---

## Build order recommendation

Build in this order — each depends only on services above it:

```
1. [infra]    docker-compose + postgres + redis + kafka + mongodb  (SESSION 10, do this first)
2. [service]  user-service                                          (SESSION 1)
3. [service]  session-service                                       (SESSION 2)
4. [service]  enrichment-service                                    (SESSION 3)
5. [service]  expense-service                                       (SESSION 6 — simple, do early)
6. [service]  analytics-service                                     (SESSION 8)
7. [service]  prediction-service                                    (SESSION 4 — heaviest ML work)
8. [service]  iss-service                                           (SESSION 5)
9. [service]  chatbot-service                                       (SESSION 7)
10. [frontend] web                                                  (SESSION 9 — last, needs APIs working)
```
