# GigFinance AI

**Smart Financial Support System for Gig Workers**
*Team V5 — VMedha Technical Community, CBIT*

An AI-driven financial intelligence platform built exclusively for India's gig workforce. Provides earnings prediction, expense tracking, Income Stability Scoring, and an AI financial guidance chatbot.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [First-Time Setup](#first-time-setup)
4. [Running the Full Stack](#running-the-full-stack)
5. [Running Individual Services](#running-individual-services)
6. [Environment Variables Reference](#environment-variables-reference)
7. [Seeding the ML Model](#seeding-the-ml-model)
8. [Seeding the Pinecone Knowledge Base](#seeding-the-pinecone-knowledge-base)
9. [Running Tests](#running-tests)
10. [Service Port Map](#service-port-map)
11. [Kafka Topics](#kafka-topics)
12. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (web / mobile)                     │
│                    http://localhost:3100                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │    API Gateway      │  :3000
                    │  JWT + Routing      │
                    └──────┬─────────────┘
          ┌────────────────┼─────────────────────────┐
          │                │                         │
   ┌──────▼──────┐  ┌──────▼──────┐   ┌─────────────▼──────────┐
   │user-service │  │session-svc  │   │  prediction-service     │
   │    :3001    │  │   :3002     │   │       :8001             │
   └──────┬──────┘  └──────┬──────┘   └─────────────────────────┘
          │                │  Kafka
          │         ┌──────▼────────────────────┐
          │         │   enrichment-service       │  :3003 (health)
          │         │   (Kafka consumer)         │
          │         └───────────────────────────┘
          │
   ┌──────▼──────┐  ┌─────────────┐  ┌──────────────┐
   │expense-svc  │  │  iss-svc    │  │chatbot-svc   │
   │   :3004     │  │   :8002     │  │   :8003      │
   └─────────────┘  └─────────────┘  └──────────────┘
                                      ┌──────────────┐
                                      │analytics-svc │
                                      │   :8004      │
                                      └──────────────┘

Infrastructure:
  PostgreSQL :5432  |  MongoDB :27017  |  Redis :6379  |  Kafka :9092
```

**Spec files** (single source of truth — read before touching any service):
- `docs/spec/CONVENTIONS.md` — naming rules, folder structure, service boundaries
- `docs/spec/TYPES.ts` — all data shapes
- `docs/spec/DB_SCHEMA.sql` — all PostgreSQL tables
- `docs/spec/API_CONTRACT.md` — all HTTP endpoints and Kafka events

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | ≥ 4.30 | https://www.docker.com/products/docker-desktop |
| Docker Compose | ≥ 2.27 (included in Docker Desktop) | — |
| Node.js | ≥ 20 LTS | https://nodejs.org |
| Python | ≥ 3.11 | https://www.python.org |
| OpenSSL | any recent | Usually pre-installed on macOS/Linux |
| `openssl` CLI | any | `brew install openssl` or `apt install openssl` |

**External API accounts needed** (free tiers are enough for development):
- [Twilio](https://www.twilio.com) — OTP SMS delivery
- [OpenWeatherMap](https://openweathermap.org/api) — weather enrichment
- [Google Cloud](https://console.cloud.google.com) — Geocoding API
- [Anthropic](https://console.anthropic.com) — Claude API (chatbot)
- [Pinecone](https://www.pinecone.io) — vector database (RAG)

---

## First-Time Setup

Run these steps **once** before your first `docker-compose up`.

### Step 1 — Clone and enter the repo

```bash
git clone https://github.com/your-org/gigfinance-ai.git
cd gigfinance-ai
```

### Step 2 — Generate JWT keys

```bash
chmod +x infra/scripts/generate_jwt_keys.sh
./infra/scripts/generate_jwt_keys.sh
```

This creates `infra/keys/private.pem` and `infra/keys/public.pem`.
These files are in `.gitignore` — never commit them.

### Step 3 — Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in:
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `OPENWEATHERMAP_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- `ANTHROPIC_API_KEY`
- `PINECONE_API_KEY`

You can leave all `*_PASSWORD` and `SERVICE_SECRET` at their dev defaults for local development.

### Step 4 — Create Pinecone index

Log into [Pinecone console](https://app.pinecone.io) and create an index:
- **Name:** `gigfinance-knowledge-base`
- **Dimensions:** `384`
- **Metric:** `cosine`
- **Cloud:** any (choose free tier)

### Step 5 — Build a placeholder ML model (prediction-service needs it to start)

```bash
cd ml
pip install scikit-learn lightgbm joblib numpy pandas
python scripts/create_placeholder_model.py
cd ..
```

This creates `ml/models/generic_model.joblib` — a random forest trained on minimal synthetic data. The real model is trained separately (see [Seeding the ML Model](#seeding-the-ml-model)).

---

## Running the Full Stack

```bash
docker-compose up --build
```

**First boot takes 3–5 minutes.** PostgreSQL runs the schema migration automatically. Kafka topics are created by the `kafka-init` container.

Check everything is healthy:
```bash
curl http://localhost:3000/health | python3 -m json.tool
```

All services should show `"status": "ok"`.

**Stop everything:**
```bash
docker-compose down
```

**Stop and wipe all data (fresh start):**
```bash
docker-compose down -v
```

---

## Running Individual Services

Useful during development — run just the service you're working on.

### Node.js services (user-service, session-service, expense-service, api-gateway)

```bash
# Start infrastructure only
docker-compose up postgres redis kafka zookeeper kafka-init mongodb -d

# Run a single service locally
cd apps/user-service
cp .env.example .env   # fill in values
npm install
npm run dev
```

### Python services (prediction-service, iss-service, chatbot-service, analytics-service, enrichment-service)

```bash
# Start infrastructure only
docker-compose up postgres redis kafka zookeeper kafka-init mongodb -d

# Run a single service
cd apps/prediction-service
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # fill in values
uvicorn app.main:app --reload --port 8001
```

---

## Environment Variables Reference

All variables are documented in `.env.example`. Quick reference by service:

| Variable | Used By | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | All | PostgreSQL password |
| `MONGO_PASSWORD` | chatbot-service | MongoDB password |
| `REDIS_PASSWORD` | All (except chatbot) | Redis password |
| `SERVICE_SECRET` | All | Shared secret for service-to-service auth |
| `JWT_PRIVATE_KEY_PATH` | user-service | Path to RS256 private key (for signing) |
| `JWT_PUBLIC_KEY_PATH` | All except enrichment | Path to RS256 public key (for verification) |
| `TWILIO_ACCOUNT_SID` | user-service | Twilio account identifier |
| `TWILIO_AUTH_TOKEN` | user-service | Twilio auth token |
| `TWILIO_FROM_NUMBER` | user-service | SMS sender number |
| `OPENWEATHERMAP_API_KEY` | enrichment-service | Weather API key |
| `GOOGLE_MAPS_API_KEY` | enrichment-service | Maps/geocoding API key |
| `ANTHROPIC_API_KEY` | chatbot-service | Claude API key |
| `PINECONE_API_KEY` | chatbot-service | Pinecone vector DB key |
| `MODEL_GENERIC_PATH` | prediction-service | Path to generic LightGBM model file |
| `NEXT_PUBLIC_API_URL` | web | API Gateway base URL |

---

## Seeding the ML Model

The prediction-service needs a trained LightGBM model at startup.

### 1. Generate the synthetic training dataset

```bash
cd ml
pip install -r requirements.txt
python data_generation/generate_dataset.py --output data/synthetic_sessions.csv --rows 500000
```

This creates ~500K synthetic work session rows with realistic distributions of Indian gig worker patterns.

### 2. Train the generic model

```bash
python models/train_generic_model.py \
  --data data/synthetic_sessions.csv \
  --output models/generic_model.joblib
```

Training takes ~5–10 minutes. The script prints RMSE and R² on the test split.

### 3. Verify and deploy

```bash
python models/verify_model.py --model models/generic_model.joblib
```

The `models/` directory is volume-mounted into the prediction-service container, so no rebuild needed — restart the service:

```bash
docker-compose restart prediction-service
```

---

## Seeding the Pinecone Knowledge Base

The chatbot-service uses RAG over a curated set of government documents. Seed them before using the chatbot.

```bash
cd apps/chatbot-service
pip install -r requirements.txt

# This script reads data/knowledge_chunks.json and upserts into Pinecone
python scripts/seed_knowledge_base.py
```

The knowledge base includes:
- ITR-4 / presumptive taxation guidance (Section 44AD, 44ADA)
- e-Shram registration process
- PMSBY, PMJJBY, APY scheme details
- PM-MUDRA loan eligibility
- RBI guidelines on savings accounts for informal workers

To add new documents, add entries to `apps/chatbot-service/data/knowledge_chunks.json` and re-run the seeding script.

---

## Running Tests

### All services

```bash
# Node.js services
for service in user-service session-service expense-service api-gateway; do
  echo "Testing $service..."
  cd apps/$service && npm test && cd ../..
done

# Python services
for service in prediction-service iss-service chatbot-service analytics-service enrichment-service; do
  echo "Testing $service..."
  cd apps/$service && python -m pytest tests/ -v && cd ../..
done
```

### Single service

```bash
# Node.js
cd apps/user-service && npm test

# Python
cd apps/prediction-service && python -m pytest tests/ -v --tb=short
```

### Integration tests (requires full stack running)

```bash
docker-compose up -d
sleep 30  # wait for all services to be healthy
cd tests/integration && npm test
```

---

## Service Port Map

| Service | Port | Type | Notes |
|---|---|---|---|
| api-gateway | 3000 | HTTP | **Single entry point for all clients** |
| user-service | 3001 | HTTP | OTP auth, user profiles |
| session-service | 3002 | HTTP | Work session CRUD |
| enrichment-service | 3003 | HTTP | Health check only; Kafka consumer |
| expense-service | 3004 | HTTP | Expense CRUD |
| prediction-service | 8001 | HTTP | ML prediction endpoints |
| iss-service | 8002 | HTTP | Income Stability Score |
| chatbot-service | 8003 | HTTP | RAG chatbot |
| analytics-service | 8004 | HTTP | Dashboard aggregations |
| web | 3100 | HTTP | Next.js frontend |
| postgres | 5432 | TCP | PostgreSQL 16 |
| mongodb | 27017 | TCP | MongoDB 7 |
| redis | 6379 | TCP | Redis 7 |
| kafka | 9092 | TCP | External (host access) |
| kafka | 29092 | TCP | Internal (container-to-container) |
| zookeeper | 2181 | TCP | Kafka dependency |

---

## Kafka Topics

| Topic | Partitions | Producer | Consumer(s) |
|---|---|---|---|
| `session.created` | 3 | session-service | enrichment-service, prediction-service |
| `session.enriched` | 3 | session-service | prediction-service, analytics-service |
| `prediction.requested` | 3 | session-service, scheduler | prediction-service |
| `iss.recompute.requested` | 1 | scheduler | iss-service |

View topics in Kafka:
```bash
docker exec gigfinance-kafka kafka-topics --bootstrap-server localhost:29092 --list
```

Consume a topic (for debugging):
```bash
docker exec gigfinance-kafka kafka-console-consumer \
  --bootstrap-server localhost:29092 \
  --topic session.created \
  --from-beginning
```

---

## Troubleshooting

### "Port already in use"
```bash
# Find and kill the process using the port (e.g. 5432)
lsof -ti:5432 | xargs kill -9
```

### Kafka not starting / "connection refused"
Kafka depends on Zookeeper being healthy first. Wait 60 seconds after `docker-compose up` before checking. If it still fails:
```bash
docker-compose restart zookeeper kafka kafka-init
```

### PostgreSQL schema not applied
The schema runs only on first boot (empty volume). To re-run it:
```bash
docker-compose down -v   # ⚠️ wipes all data
docker-compose up postgres -d
sleep 10
docker-compose up -d
```

### prediction-service exits immediately
It needs `ml/models/generic_model.joblib` to exist. Run the model seeding steps above first.

### OTP not arriving (Twilio)
- Check `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` are correct in `.env`
- Twilio trial accounts can only send to verified numbers — add your number at [twilio.com/console](https://www.twilio.com/console)
- In development, check user-service logs: `docker logs gigfinance-user-service` — the OTP is logged at DEBUG level

### Chatbot returns "I cannot answer this"
The Pinecone knowledge base needs seeding. Run `python scripts/seed_knowledge_base.py` from the chatbot-service directory.

---

## Project Structure

```
gigfinance-ai/
├── apps/
│   ├── api-gateway/          # Node.js: JWT + routing
│   ├── user-service/         # Node.js: auth, user profiles
│   ├── session-service/      # Node.js: work session CRUD + Kafka events
│   ├── enrichment-service/   # Python: Kafka consumer, weather/maps/fuel
│   ├── expense-service/      # Node.js: expense tracking
│   ├── prediction-service/   # Python: LightGBM ML serving
│   ├── iss-service/          # Python: Income Stability Score
│   ├── chatbot-service/      # Python: RAG + Claude API
│   ├── analytics-service/    # Python: dashboard aggregations
│   └── web/                  # Next.js 14: frontend
├── ml/
│   ├── data_generation/      # Synthetic dataset scripts
│   ├── models/               # Training scripts + model artifacts
│   └── experiments/          # Jupyter notebooks
├── infra/
│   ├── postgres/init/        # DB schema (auto-run on first boot)
│   ├── keys/                 # JWT keys (git-ignored)
│   └── scripts/              # Key generation, etc.
├── docs/
│   └── spec/                 # CONVENTIONS.md, TYPES.ts, DB_SCHEMA.sql, API_CONTRACT.md
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

*GigFinance AI — Team V5, VMedha, CBIT | Built for SDG 8: Decent Work & Economic Growth*
