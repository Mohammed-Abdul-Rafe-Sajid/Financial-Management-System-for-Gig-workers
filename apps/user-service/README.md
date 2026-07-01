# user-service

GigFinance AI — handles phone/OTP authentication, JWT issuance & refresh,
and the `users` profile table. Owns the `users` table exclusively
(`CONVENTIONS.md` §4) — every other service must call this service's
public API rather than reading the table directly.

## What it does

- `POST /api/v1/auth/request-otp` — generates a 6-digit OTP, stores it in
  Redis (5 min TTL), sends it via Twilio SMS. Rate-limited to 5
  requests / 15 min / phone number.
- `POST /api/v1/auth/verify-otp` — verifies the OTP, creates the user on
  first login (upsert by phone number), and issues an RS256-signed access
  token (15 min) + refresh token (7 days).
- `POST /api/v1/auth/refresh` — exchanges a valid, non-revoked refresh
  token for a new access token.
- `GET /api/v1/users/me` / `PATCH /api/v1/users/me` — read/update the
  authenticated user's profile.
- `GET /api/v1/users/:id` — **internal only**, requires a service auth
  token (see SPEC GAP below), used by other services to resolve user data.
- `GET /health` — liveness check.

## Running locally

```bash
cp .env.example .env
# generate a dev RSA keypair and paste into .env (see comments in .env.example)
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem

npm install
npm run dev        # ts-node-dev, hot reload
```

Requires a reachable PostgreSQL instance with the `users` table from
`DB_SCHEMA.sql` already migrated, and a reachable Redis instance.

## Testing

```bash
npm test
```

Unit tests cover `services/otp.service.ts`, `services/jwt.service.ts`,
`services/auth.service.ts`, and `services/user.service.ts` with the
repository/Redis/Twilio layers mocked. Add integration tests (supertest +
a real/test Postgres + Redis) under `tests/` as the suite grows — none are
included here since the PRD didn't specify a test DB provisioning strategy
(see SPEC GAP below).

## Building & running with Docker

```bash
docker build -t user-service .
docker run --env-file .env -p 3001:3001 user-service
```

## Environment variables

| Variable | Description |
|---|---|
| `PORT` | HTTP port (default `3001`) |
| `NODE_ENV` | `development` \| `production` |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | RS256 PEM keypair (`\n`-escaped) |
| `JWT_ACCESS_TOKEN_EXPIRY_SECONDS` | Default `900` (15 min, per PRD) |
| `JWT_REFRESH_TOKEN_EXPIRY_SECONDS` | Default `604800` (7 days) |
| `OTP_TTL_SECONDS` | Default `300` (5 min, per API_CONTRACT.md §1) |
| `OTP_RATE_LIMIT_MAX_REQUESTS` | Default `5` |
| `OTP_RATE_LIMIT_WINDOW_SECONDS` | Default `900` (15 min) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS delivery |
| `INTERNAL_SERVICE_TOKEN` | Shared secret for internal `GET /users/:id` calls |

## Folder structure

Follows `CONVENTIONS.md` §5 exactly:

```
src/
├── routes/        # thin Express route wiring
├── controllers/    # request/response only, delegates to services/
├── services/        # business logic (auth, otp, jwt, sms, user)
├── repositories/     # DB access layer (parameterized pg queries only)
├── types/             # shared TS types + zod schemas + error codes
├── middleware/         # auth, service-auth, validation, error handling
├── events/              # empty — see events/README.md
└── index.ts
```

## ⚠️ SPEC GAPs encountered

These are documented inline at the point of assumption too (`grep -r "SPEC GAP"`),
listed here for visibility:

1. **Internal service-to-service auth mechanism.** `API_CONTRACT.md` states
   `GET /api/v1/users/:id` "requires service auth token, not user JWT" but
   never defines the token format. Implemented as a single shared static
   bearer secret (`INTERNAL_SERVICE_TOKEN`) checked in
   `middleware/service-auth.middleware.ts`. If the project adopts a
   per-service signed JWT or mTLS scheme instead, only this file needs to
   change.
2. **User auto-creation on first OTP verification.** Neither
   `API_CONTRACT.md` nor `TYPES.ts` distinguishes "signup" from "login" —
   there's no separate signup endpoint. Implemented `verify-otp` as an
   upsert: first successful OTP verification for a phone number creates the
   user row (with DB defaults for everything else), consistent with the
   PRD's "minimal manual input" principle. If a distinct signup flow
   (e.g. requiring name/city upfront) is intended, this needs revisiting.
3. **SMS copy/localization.** No template or i18n strategy is specified for
   the OTP SMS body. Sent as a fixed English string since `preferred_language`
   isn't known until after account creation.
4. **Refresh token rotation.** `API_CONTRACT.md`'s `/auth/refresh` response
   shape only includes a new `access_token` (no new `refresh_token`), so
   refresh tokens are treated as long-lived and non-rotating — just
   allow-listed in Redis by `jti` so they can be individually revoked later
   if a revoke-token endpoint is ever added (not in current contract).
5. **Integration/E2E test infrastructure.** `CONVENTIONS.md` §7 requires "at
   least one integration test per endpoint," but no test-database
   provisioning approach (e.g. testcontainers, docker-compose for CI) is
   specified anywhere in the contract files. Only unit tests (with mocked
   repository/Redis/Twilio layers) are included; wiring up a real
   Postgres+Redis for CI integration tests is left as a follow-up.
