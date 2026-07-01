/**
 * TYPES.ts — GigFinance AI Shared Type Definitions
 *
 * This file is the single source of truth for data shapes across the entire
 * project. Every service, every Claude session, every frontend component
 * must use these exact shapes (or their Pydantic/SQL equivalents — see
 * DB_SCHEMA.sql for table definitions and API_CONTRACT.md for wire format).
 *
 * Python services: mirror these as Pydantic models with identical field
 * names (snake_case, matching the API contract — see CONVENTIONS.md §1).
 *
 * DO NOT rename fields, change types, or add fields without updating this
 * file first and notifying all in-progress sessions.
 */

// ─────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────

export type Platform =
  | "uber" | "ola" | "rapido"
  | "swiggy" | "zomato" | "blinkit" | "zepto"
  | "porter" | "urban_company" | "dunzo" | "other";

export type Domain =
  | "ride_hailing" | "food_delivery" | "quick_commerce"
  | "home_services" | "logistics" | "other";

export type VehicleType = "bike" | "auto" | "car" | "none";

export type Language = "en" | "hi" | "te" | "ta" | "kn" | "mr";

export type ExpenseCategory =
  | "fuel" | "vehicle_maintenance" | "food"
  | "mobile_data" | "platform_penalty" | "tools_equipment" | "other";

export type PredictionType =
  | "daily" | "weekly" | "monthly" | "yearly" | "goal_based" | "scenario";

export type ScoreBand = "poor" | "fair" | "good" | "excellent";

export type WeatherCondition =
  | "clear" | "cloudy" | "light_rain" | "heavy_rain" | "storm" | "fog";

// ─────────────────────────────────────────────────────────────────────────
// CORE ENTITIES — mirror DB_SCHEMA.sql tables exactly
// ─────────────────────────────────────────────────────────────────────────

export interface User {
  id: string; // UUID
  phone_number: string;
  email: string | null;
  name: string | null;
  preferred_language: Language;
  city: string | null;
  vehicle_type: VehicleType;
  active_platforms: Platform[];
  active_domains: Domain[];
  is_active: boolean;
  created_at: string; // ISO 8601
  updated_at: string;
}

export interface WorkSession {
  id: string; // UUID
  user_id: string;
  platform: Platform;
  domain: Domain;
  session_date: string; // YYYY-MM-DD
  start_time: string; // ISO 8601 timestamp
  end_time: string | null;
  gross_earnings_inr: number;
  platform_commission_inr: number | null;
  incentive_inr: number;
  net_platform_earnings_inr: number; // computed: gross - commission + incentive
  distance_km: number | null;
  fuel_cost_inr: number | null;
  net_earnings_after_fuel_inr: number | null; // computed
  trips_or_jobs_count: number | null;
  city: string | null;
  zone: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  enrichment_data: EnrichmentData | null;
  enrichment_status: "pending" | "enriched" | "failed";
  created_at: string;
  deleted_at: string | null;
}

export interface EnrichmentData {
  weather_condition: WeatherCondition | null;
  temperature_celsius: number | null;
  is_public_holiday: boolean;
  is_festival_period: boolean;
  holiday_name: string | null;
  traffic_index: number | null; // 0-1 normalized
  fuel_price_per_litre: number | null;
  day_of_week: number; // 0=Monday ... 6=Sunday
  is_weekday: boolean;
  week_of_year: number;
  enriched_at: string; // ISO 8601
}

export interface Expense {
  id: string; // UUID
  user_id: string;
  session_id: string | null; // nullable - standalone expense
  category: ExpenseCategory;
  amount_inr: number;
  description: string | null;
  expense_date: string; // YYYY-MM-DD
  created_at: string;
  deleted_at: string | null;
}

export interface IncomeStabilityScore {
  id: string; // UUID
  user_id: string;
  composite_score: number; // 0.00 - 100.00
  score_band: ScoreBand;
  component_scores: {
    earning_frequency_score: number;   // EFS - weight 0.20
    earning_volume_score: number;      // EVS - weight 0.20
    earning_stability_score: number;   // ESS - weight 0.20
    earning_trend_score: number;       // ETS - weight 0.15
    earning_gap_score: number;         // EGS - weight 0.10
    platform_diversity_score: number;  // PDS - weight 0.10
    expense_stability_score: number;   // XSS - weight 0.05
  };
  data_sufficiency_flag: boolean; // true if >= 30 sessions
  sessions_used_count: number;
  computed_at: string;
}

export interface MlPrediction {
  id: string; // UUID
  user_id: string;
  prediction_type: PredictionType;
  prediction_date: string; // YYYY-MM-DD - date being predicted for
  predicted_value_inr: number;
  confidence_interval_lower_inr: number;
  confidence_interval_upper_inr: number;
  model_version: string;
  personal_weight_used: number; // 0.0 - 1.0, see W_personal formula
  feature_snapshot: Record<string, unknown>; // JSONB
  explanation: PredictionExplanation | null; // SHAP-based
  created_at: string;
}

export interface PredictionExplanation {
  top_factors: Array<{
    feature: string;
    contribution_inr: number; // signed - positive or negative impact
    human_readable: string; // e.g. "Tuesday mornings: +₹120"
  }>;
}

export interface GoalBasedPredictionRequest {
  target_amount_inr: number;
  target_period_days: number;
  preferred_platforms?: Platform[];
}

export interface GoalBasedPredictionResult {
  required_hours_per_day: number;
  required_days: number;
  recommended_platform: Platform;
  recommended_time_slots: Array<{ start_hour: number; end_hour: number }>;
  feasibility_score: number; // 0-1, how achievable based on personal history
}

export interface ScenarioSimulationRequest {
  base_prediction_type: "weekly" | "monthly";
  changes: {
    fuel_price_delta_pct?: number;
    additional_hours_per_week?: number;
    platform_switch_to?: Platform;
    include_weekends?: boolean;
  };
}

export interface ScenarioSimulationResult {
  baseline_earnings_inr: number;
  projected_earnings_inr: number;
  delta_inr: number;
  delta_pct: number;
}

export interface ChatMessage {
  id: string; // UUID
  session_id: string; // chat conversation id
  user_id: string;
  role: "user" | "assistant";
  content: string;
  language: Language;
  sources: Array<{ title: string; url: string }> | null; // RAG citations
  created_at: string;
}

export interface Scheme {
  id: string; // UUID
  name: string;
  description: string;
  category: "insurance" | "pension" | "welfare" | "credit" | "registration";
  eligibility_criteria: Record<string, unknown>; // structured filter rules
  official_url: string;
  application_steps: string[];
  last_verified_at: string;
}

// ─────────────────────────────────────────────────────────────────────────
// API ENVELOPE TYPES — every endpoint response uses these wrappers
// ─────────────────────────────────────────────────────────────────────────

export interface ApiSuccessSingle<T> {
  data: T;
}

export interface ApiSuccessList<T> {
  data: T[];
  next_cursor: string | null;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Standard error codes — use these exact strings, see API_CONTRACT.md §0
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SESSION_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "OTP_INVALID"
  | "OTP_EXPIRED"
  | "RATE_LIMITED"
  | "INSUFFICIENT_DATA" // e.g. ISS requested with < 30 sessions
  | "ENRICHMENT_FAILED"
  | "INTERNAL_ERROR";

// ─────────────────────────────────────────────────────────────────────────
// KAFKA EVENT PAYLOADS — see API_CONTRACT.md §9 for topic names
// ─────────────────────────────────────────────────────────────────────────

export interface SessionCreatedEvent {
  event_type: "session.created";
  session_id: string;
  user_id: string;
  session_date: string;
  city: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  timestamp: string;
}

export interface SessionEnrichedEvent {
  event_type: "session.enriched";
  session_id: string;
  user_id: string;
  timestamp: string;
}

export interface PredictionRequestedEvent {
  event_type: "prediction.requested";
  user_id: string;
  trigger_reason: "new_session" | "scheduled_retrain" | "user_request";
  timestamp: string;
}
