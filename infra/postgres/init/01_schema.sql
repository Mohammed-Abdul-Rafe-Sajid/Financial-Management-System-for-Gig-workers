-- =============================================================================
-- 01_schema.sql — GigFinance AI Database Initialization
-- This file is run automatically by postgres:16 on first container boot.
-- It is a copy of DB_SCHEMA.sql. Keep in sync with DB_SCHEMA.sql.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── ENUM TYPES ───────────────────────────────────────────────────────────────

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

CREATE TYPE scheme_category_enum AS ENUM ('insurance', 'pension', 'welfare', 'credit', 'registration');

-- ─── users ────────────────────────────────────────────────────────────────────

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

-- ─── work_sessions ────────────────────────────────────────────────────────────

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

CREATE INDEX idx_sessions_user_date     ON work_sessions(user_id, session_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_user_platform ON work_sessions(user_id, platform)     WHERE deleted_at IS NULL;
CREATE INDEX idx_sessions_enrich_status ON work_sessions(enrichment_status)     WHERE enrichment_status != 'enriched';
CREATE INDEX idx_sessions_enrich_data   ON work_sessions USING GIN (enrichment_data);

-- ─── expenses ─────────────────────────────────────────────────────────────────

CREATE TABLE expenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id),
  session_id      UUID REFERENCES work_sessions(id),
  category        expense_category_enum NOT NULL,
  amount_inr      DECIMAL(10,2) NOT NULL CHECK (amount_inr >= 0),
  description     TEXT,
  expense_date    DATE NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_expenses_user_date ON expenses(user_id, expense_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_category  ON expenses(user_id, category)     WHERE deleted_at IS NULL;

-- ─── income_stability_scores ──────────────────────────────────────────────────

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

CREATE TABLE iss_score_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id),
  composite_score DECIMAL(5,2) NOT NULL,
  score_band      score_band_enum NOT NULL,
  computed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_iss_history_user ON iss_score_history(user_id, computed_at DESC);

-- ─── ml_predictions ───────────────────────────────────────────────────────────

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

CREATE TABLE prediction_accuracy_log (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_id       UUID NOT NULL REFERENCES ml_predictions(id),
  actual_value_inr    DECIMAL(10,2) NOT NULL,
  evaluated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── schemes ──────────────────────────────────────────────────────────────────

CREATE TABLE schemes (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                   VARCHAR(255) NOT NULL,
  description            TEXT NOT NULL,
  category               scheme_category_enum NOT NULL,
  eligibility_criteria   JSONB NOT NULL DEFAULT '{}',
  official_url           VARCHAR(500) NOT NULL,
  application_steps      JSONB NOT NULL DEFAULT '[]',
  last_verified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schemes_category ON schemes(category);

-- ─── notification_preferences ─────────────────────────────────────────────────

CREATE TABLE notification_preferences (
  user_id      UUID PRIMARY KEY REFERENCES users(id),
  push_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  fcm_token     VARCHAR(500),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Seed: government schemes ─────────────────────────────────────────────────

INSERT INTO schemes (name, description, category, eligibility_criteria, official_url, application_steps) VALUES
(
  'e-Shram',
  'National database of unorganised workers. Provides UAN (Universal Account Number) and access to social security benefits for gig and informal workers.',
  'registration',
  '{"age_min": 16, "age_max": 59, "not_epfo_member": true, "not_esic_member": true}',
  'https://eshram.gov.in',
  '["Visit eshram.gov.in or nearest CSC center", "Enter Aadhaar number and OTP for verification", "Fill basic profile: name, address, occupation, bank account", "Download e-Shram card with UAN"]'
),
(
  'PMSBY — Pradhan Mantri Suraksha Bima Yojana',
  'Accidental death and disability insurance. Coverage of ₹2 lakh for accidental death or total disability, ₹1 lakh for partial disability. Annual premium: ₹20.',
  'insurance',
  '{"age_min": 18, "age_max": 70, "has_savings_bank_account": true}',
  'https://www.myscheme.gov.in/schemes/pmsby',
  '["Log in to your bank''s net banking or mobile app", "Navigate to Insurance section", "Select PMSBY and link your savings account", "Pay ₹20 annual premium (auto-deducted)"]'
),
(
  'PMJJBY — Pradhan Mantri Jeevan Jyoti Bima Yojana',
  'Life insurance scheme. Coverage of ₹2 lakh for death due to any cause. Annual premium: ₹436.',
  'insurance',
  '{"age_min": 18, "age_max": 50, "has_savings_bank_account": true}',
  'https://www.myscheme.gov.in/schemes/pmjjby',
  '["Visit your bank branch or use net banking", "Fill PMJJBY enrollment form", "Give auto-debit consent for ₹436/year", "Coverage starts from enrollment date"]'
),
(
  'APY — Atal Pension Yojana',
  'Pension scheme for unorganised sector workers. Guaranteed monthly pension of ₹1,000–₹5,000 after age 60, based on contribution amount.',
  'pension',
  '{"age_min": 18, "age_max": 40, "has_savings_bank_account": true, "not_income_taxpayer": true}',
  'https://www.npscra.nsdl.co.in/scheme-details.php',
  '["Visit bank branch or use mobile banking", "Fill APY registration form", "Choose pension amount (₹1000-₹5000/month)", "Set up auto-debit for monthly contribution", "Contribute until age 60 to receive pension"]'
),
(
  'PM-MUDRA — Pradhan Mantri MUDRA Yojana',
  'Collateral-free micro-loans for non-farm income generating activities. Shishu (up to ₹50,000), Kishore (₹50,001–₹5 lakh), Tarun (₹5–₹10 lakh).',
  'credit',
  '{"is_non_farm_business": true, "no_default_history": true}',
  'https://www.mudra.org.in',
  '["Prepare business plan and income proof", "Visit nearest bank, MFI or NBFC", "Fill MUDRA loan application", "Submit: Aadhaar, PAN, bank statements (6 months)", "Approval typically within 7-14 working days"]'
);
