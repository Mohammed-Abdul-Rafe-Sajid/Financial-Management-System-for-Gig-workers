/**
 * src/types/index.ts
 * Local mirror of the relevant shapes from TYPES.ts (spec file).
 * Field names must stay in sync with TYPES.ts — do not rename anything here.
 */

// ── Enums (mirror TYPES.ts exactly) ──────────────────────────────────────────

export type Platform =
  | 'uber' | 'ola' | 'rapido'
  | 'swiggy' | 'zomato' | 'blinkit' | 'zepto'
  | 'porter' | 'urban_company' | 'dunzo' | 'other';

export type Domain =
  | 'ride_hailing' | 'food_delivery' | 'quick_commerce'
  | 'home_services' | 'logistics' | 'other';

export type WeatherCondition =
  | 'clear' | 'cloudy' | 'light_rain' | 'heavy_rain' | 'storm' | 'fog';

export type EnrichmentStatus = 'pending' | 'enriched' | 'failed';

// ── Core entities (mirror TYPES.ts exactly) ───────────────────────────────────

export interface EnrichmentData {
  weather_condition: WeatherCondition | null;
  temperature_celsius: number | null;
  is_public_holiday: boolean;
  is_festival_period: boolean;
  holiday_name: string | null;
  traffic_index: number | null;       // 0–1 normalized
  fuel_price_per_litre: number | null;
  day_of_week: number;                // 0=Monday … 6=Sunday
  is_weekday: boolean;
  week_of_year: number;
  enriched_at: string;                // ISO 8601
}

export interface WorkSession {
  id: string;
  user_id: string;
  platform: Platform;
  domain: Domain;
  session_date: string;               // YYYY-MM-DD
  start_time: string;                 // ISO 8601
  end_time: string | null;
  gross_earnings_inr: number;
  platform_commission_inr: number | null;
  incentive_inr: number;
  net_platform_earnings_inr: number;  // DB GENERATED column
  distance_km: number | null;
  fuel_cost_inr: number | null;
  net_earnings_after_fuel_inr: number | null; // DB GENERATED column
  trips_or_jobs_count: number | null;
  city: string | null;
  zone: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  enrichment_data: EnrichmentData | null;
  enrichment_status: EnrichmentStatus;
  created_at: string;
  deleted_at: string | null;
}

// ── Kafka event payloads (mirror TYPES.ts exactly) ────────────────────────────

export interface SessionCreatedEvent {
  event_type: 'session.created';
  session_id: string;
  user_id: string;
  session_date: string;
  city: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  timestamp: string;
}

export interface SessionEnrichedEvent {
  event_type: 'session.enriched';
  session_id: string;
  user_id: string;
  timestamp: string;
}

export interface PredictionRequestedEvent {
  event_type: 'prediction.requested';
  user_id: string;
  trigger_reason: 'new_session' | 'scheduled_retrain' | 'user_request';
  timestamp: string;
}

// ── API envelope types (CONVENTIONS.md §3) ────────────────────────────────────

export interface ApiSuccessSingle<T> {
  data: T;
}

export interface ApiSuccessList<T> {
  data: T[];
  next_cursor: string | null;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'INTERNAL_ERROR';

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
}

// ── Cursor pagination ─────────────────────────────────────────────────────────

export interface CursorPayload {
  id: string;         // UUID of the last item in previous page
  created_at: string; // ISO 8601 — used for keyset pagination
}

// ── JWT payload (from user-service, validated but not signed here) ────────────

export interface JwtPayload {
  sub: string;   // user UUID
  phone: string;
  iat: number;
  exp: number;
}
