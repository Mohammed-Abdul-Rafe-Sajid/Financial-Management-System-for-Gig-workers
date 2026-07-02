# Known Spec Gaps

## session-service
1. No idempotency key on POST /sessions — duplicate network retries create duplicate sessions. Fix: add optional `idempotency_key` field, Redis dedup. Not blocking other services.
2. No stale-pending cleanup — sessions stuck `pending` if enrichment-service is down. Fix: Airflow DAG marks them `failed` after 1 hour. Not blocking other services.

## user-service
1. Internal service auth uses static SERVICE_SECRET bearer token. Resolved in API_CONTRACT.md §0.
2. User auto-created on first OTP verify (upsert). No separate signup endpoint.
3. Refresh tokens non-rotating. Noted for future security hardening.