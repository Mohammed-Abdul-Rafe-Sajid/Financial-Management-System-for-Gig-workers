-- ============================================================================
-- DB_SCHEMA.sql — GigFinance AI Database Schema
-- ============================================================================
-- This is the single source of truth for all PostgreSQL tables.
-- Every service must use these exact table/column names (CONVENTIONS.md §1).
-- MongoDB collections (chat history, scheme content) are documented at the
-- bottom in comment form since they're schema-less.
--
-- Ownership: see CONVENTIONS.md §4 for which service owns which table.
-- NEVER let a service write to a table it doesn't own — call that service's
-- API instead.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────────────────
-- ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────

CREATE TYPE platform_enum AS ENUM (
  'uber', 'ola', 'rapido', 'swiggy', 'zomato', 'blinkit', 'zepto',
  'porter', 'urban_company', 'dunzo', 'other'
);

CREATE TYPE domain_enum AS ENUM (
  'ride_hailing', 'food_delivery', 'quick_commerce', 'home_services', 'logistics', 'other'
);

CREATE TYPE vehicle_type_enum AS ENUM ('bike', 'auto', 'car', 'none');

CREATE TYPE language_enum AS ENUM ('en', 'hi', 'te', 'ta', 'kn', 'mr');

CREATE TYPE expense_category_enum AS ENUM (
  'fuel', 'vehicle_maintenance', 'food', 'mobile_data', 'platform_penalty', 'tools_equipment', 'other'
);

CREATE TYPE prediction_type_enum AS ENUM (
  'daily', 'weekly', 'monthly', 'yearly', 'goal_based', 'scenario'
);

CREATE TYPE score_band_enum AS ENUM ('poor', 'fair', 'good', 'excellent');

CREATE TYPE enrichment_status_enum AS ENUM ('pending', 'enriched', 'failed');

-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: users
-- Owned by: user-service
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number         VARCHAR(15) UNIQUE NOT NULL,
  email                VARCHAR(255) UNIQUE,
  name                 VARCHAR(255),
  preferred_language   language_enum NOT NULL DEFAULT 'en',
  city                 VARCHAR(100),
  vehicle_type         vehicle_type_enum NOT NULL DEFAULT 'none',
  active_platforms     platform_enum[] NOT NULL DEFAULT '{}',
  active_domains       domain_enum[] NOT NULL DEFAULT '{}',
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone_number);

-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: work_sessions
-- Owned by: session-service (enrichment-service writes enrichment_data
-- via session-service's internal API, never directly)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE work_sessions (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                     UUID NOT NULL REFERENCES users(id),
  platform                    platform_enum NOT NULL,
  domain                      domain_enum NOT NULL,
  session_date                DATE NOT NULL,
  start_time                  TIMESTAMPTZ NOT NULL,
  end_time                    TIMESTAMPTZ,
  gross_earnings_inr          DECIMAL(10,2) NOT NULL CHECK (gross_earnings_inr >= 0),
  platform_commission_inr     DECIMAL(10,2) CHECK (platform_commission_inr >= 0),
  incentive_inr               DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (incentive_inr >= 0),
  net_platform_earnings_inr   DECIMAL(10,2) GENERATED ALWAYS AS
                                 (gross_earnings_inr - COALESCE(platform_commission_inr, 0) + incentive_inr) STORED,
  distance_km                 DECIMAL(8,2) CHECK (distance_km >= 0),
  fuel_cost_inr               DECIMAL(8,2) CHECK (fuel_cost_inr >= 0),
  net_earnings_after_fuel_inr DECIMAL(10,2) GENERATED ALWAYS AS
                                 (gross_earnings_inr - COALESCE(platform_commission_inr, 0) + incentive_inr - COALESCE(fuel_cost_inr, 0)) STORED,
  trips_or_jobs_count         INTEGER CHECK (trips_or_jobs_count >= 0),
  city                        VARCHAR(100),
  zone                        VARCHAR(200),
  gps_lat                     DECIMAL(10,7),
  gps_lng                     DECIMAL(10,7),
  enrichment_data             JSONB,
  enrichment_status           enrichment_status_enum NOT NULL DEFAULT 'pending',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                  TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user_date ON work_sessions(user_id, session_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_user_platform ON work_sessions(user_id, platform) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_enrichment_status ON work_sessions(enrichment_status) WHERE enrichment_status != 'enriched';
CREATE INDEX idx_sessions_enrichment_data ON work_sessions USING GIN (enrichment_data);

-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: expenses
-- Owned by: expense-service
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE expenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id),
  session_id      UUID REFERENCES work_sessions(id), -- nullable: standalone expense
  category        expense_category_enum NOT NULL,
  amount_inr      DECIMAL(10,2) NOT NULL CHECK (amount_inr >= 0),
  description     TEXT,
  expense_date    DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_expenses_user_date ON expenses(user_id, expense_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_category ON expenses(user_id, category) WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: income_stability_scores
-- Owned by: iss-service
-- One row per user, updated in place (history tracked in iss_score_history)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE income_stability_scores (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                     UUID NOT NULL UNIQUE REFERENCES users(id),
  composite_score             DECIMAL(5,2) NOT NULL CHECK (composite_score BETWEEN 0 AND 100),
  score_band                  score_band_enum NOT NULL,
  earning_frequency_score     DECIMAL(5,2) NOT NULL,
  earning_volume_score        DECIMAL(5,2) NOT NULL,
  earning_stability_score     DECIMAL(5,2) NOT NULL,
  earning_trend_score         DECIMAL(5,2) NOT NULL,
  earning_gap_score           DECIMAL(5,2) NOT NULL,
  platform_diversity_score    DECIMAL(5,2) NOT NULL,
  expense_stability_score     DECIMAL(5,2) NOT NULL,
  data_sufficiency_flag       BOOLEAN NOT NULL DEFAULT FALSE,
  sessions_used_count         INTEGER NOT NULL DEFAULT 0,
  computed_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Historical snapshots for trend charts
CREATE TABLE iss_score_history (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id),
  composite_score   DECIMAL(5,2) NOT NULL,
  score_band        score_band_enum NOT NULL,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_iss_history_user ON iss_score_history(user_id, computed_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: ml_predictions
-- Owned by: prediction-service
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE ml_predictions (
  id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                         UUID NOT NULL REFERENCES users(id),
  prediction_type                 prediction_type_enum NOT NULL,
  prediction_date                 DATE NOT NULL,
  predicted_value_inr             DECIMAL(10,2) NOT NULL,
  confidence_interval_lower_inr   DECIMAL(10,2) NOT NULL,
  confidence_interval_upper_inr   DECIMAL(10,2) NOT NULL,
  model_version                   VARCHAR(50) NOT NULL,
  personal_weight_used            DECIMAL(4,3) NOT NULL CHECK (personal_weight_used BETWEEN 0 AND 1),
  feature_snapshot                JSONB NOT NULL,
  explanation                     JSONB,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_predictions_user_type ON ml_predictions(user_id, prediction_type, created_at DESC);

-- For tracking prediction accuracy over time (compares predicted vs actual)
CREATE TABLE prediction_accuracy_log (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_id       UUID NOT NULL REFERENCES ml_predictions(id),
  actual_value_inr    DECIMAL(10,2) NOT NULL,
  absolute_error_inr  DECIMAL(10,2) GENERATED ALWAYS AS (ABS(actual_value_inr - actual_value_inr)) STORED,
  evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: schemes
-- Owned by: scheme-service
-- ─────────────────────────────────────────────────────────────────────────

CREATE TYPE scheme_category_enum AS ENUM ('insurance', 'pension', 'welfare', 'credit', 'registration');

CREATE TABLE schemes (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                   VARCHAR(255) NOT NULL,
  description            TEXT NOT NULL,
  category               scheme_category_enum NOT NULL,
  eligibility_criteria   JSONB NOT NULL DEFAULT '{}',
  official_url           VARCHAR(500) NOT NULL,
  application_steps      JSONB NOT NULL DEFAULT '[]', -- array of strings
  last_verified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schemes_category ON schemes(category);

-- ─────────────────────────────────────────────────────────────────────────
-- TABLE: notification_preferences
-- Owned by: notification-service
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE notification_preferences (
  user_id              UUID PRIMARY KEY REFERENCES users(id),
  push_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  fcm_token            VARCHAR(500),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- MongoDB Collections (schema-less, documented here for reference only)
-- Owned by: chatbot-service
-- ============================================================================
--
-- chat_sessions: {
--   _id: ObjectId,
--   user_id: string (UUID, references PostgreSQL users.id),
--   started_at: ISODate,
--   messages: [
--     {
--       id: string (UUID),
--       role: "user" | "assistant",
--       content: string,
--       language: string,
--       sources: [{ title: string, url: string }] | null,
--       created_at: ISODate
--     }
--   ]
-- }
--
-- ============================================================================
-- Pinecone Vector Index (for RAG chatbot)
-- ============================================================================
-- Index name: gigfinance-knowledge-base
-- Dimension: 384 (if using all-MiniLM-L6-v2) or per chosen embedding model
-- Metadata per vector: { source_url, document_title, language, topic_category,
--                        chunk_text, last_updated }
-- Namespaces: one per language (en, hi, te, ta, kn, mr)
-- ============================================================================
