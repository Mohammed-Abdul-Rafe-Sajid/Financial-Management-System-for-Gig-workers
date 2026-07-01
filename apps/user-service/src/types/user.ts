/**
 * Local mirror of the `User` shape from the project-level TYPES.ts and the
 * `users` table in DB_SCHEMA.sql. user-service is the sole owner of this
 * table (CONVENTIONS.md §4) — no other service may write to it directly.
 */

export type Platform =
  | "uber" | "ola" | "rapido"
  | "swiggy" | "zomato" | "blinkit" | "zepto"
  | "porter" | "urban_company" | "dunzo" | "other";

export type Domain =
  | "ride_hailing" | "food_delivery" | "quick_commerce"
  | "home_services" | "logistics" | "other";

export type VehicleType = "bike" | "auto" | "car" | "none";

export type Language = "en" | "hi" | "te" | "ta" | "kn" | "mr";

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

/** Row shape as returned directly by `pg` (snake_case, matches wire format 1:1). */
export type UserRow = User;

export interface UpdateUserInput {
  name?: string;
  preferred_language?: Language;
  city?: string;
  vehicle_type?: VehicleType;
  active_platforms?: Platform[];
  active_domains?: Domain[];
}
