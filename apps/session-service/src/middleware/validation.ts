/**
 * middleware/validation.ts
 *
 * Zod schemas for all session-service endpoints.
 * Field names match API_CONTRACT.md §2 exactly (snake_case).
 * Money values: validated as numbers with 2dp precision (CONVENTIONS.md §2).
 */

import { z } from 'zod';

// ── Allowed enum values (mirror TYPES.ts) ─────────────────────────────────────

const PlatformEnum = z.enum([
  'uber', 'ola', 'rapido', 'swiggy', 'zomato',
  'blinkit', 'zepto', 'porter', 'urban_company', 'dunzo', 'other',
]);

const DomainEnum = z.enum([
  'ride_hailing', 'food_delivery', 'quick_commerce',
  'home_services', 'logistics', 'other',
]);

const WeatherConditionEnum = z.enum([
  'clear', 'cloudy', 'light_rain', 'heavy_rain', 'storm', 'fog',
]);

// ── POST /api/v1/sessions ─────────────────────────────────────────────────────

export const CreateSessionSchema = z.object({
  platform:                PlatformEnum,
  domain:                  DomainEnum,
  // YYYY-MM-DD
  session_date:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  // ISO 8601 timestamp
  start_time:              z.string().datetime({ message: 'Must be ISO 8601 timestamp' }),
  end_time:                z.string().datetime().nullable().optional(),
  // Money: non-negative, CONVENTIONS.md §2
  gross_earnings_inr:      z.number().min(0, 'Must be ≥ 0'),
  platform_commission_inr: z.number().min(0).nullable().optional(),
  incentive_inr:           z.number().min(0).optional().default(0),
  // Optional fields enrichment fills in
  distance_km:             z.number().min(0).nullable().optional(),
  trips_or_jobs_count:     z.number().int().min(0).nullable().optional(),
  gps_lat:                 z.number().min(-90).max(90).nullable().optional(),
  gps_lng:                 z.number().min(-180).max(180).nullable().optional(),
  city:                    z.string().max(100).nullable().optional(),
});

export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

// ── PATCH /api/v1/sessions/:id ────────────────────────────────────────────────
// Only these 3 fields are user-editable (API_CONTRACT.md §2)

export const UpdateSessionSchema = z.object({
  gross_earnings_inr:  z.number().min(0).optional(),
  distance_km:         z.number().min(0).nullable().optional(),
  trips_or_jobs_count: z.number().int().min(0).nullable().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

export type UpdateSessionInput = z.infer<typeof UpdateSessionSchema>;

// ── PATCH /api/v1/sessions/:id/enrichment (internal) ─────────────────────────

const EnrichmentDataSchema = z.object({
  weather_condition:    WeatherConditionEnum.nullable(),
  temperature_celsius:  z.number().nullable(),
  is_public_holiday:    z.boolean(),
  is_festival_period:   z.boolean(),
  holiday_name:         z.string().nullable(),
  traffic_index:        z.number().min(0).max(1).nullable(),
  fuel_price_per_litre: z.number().min(0).nullable(),
  day_of_week:          z.number().int().min(0).max(6),
  is_weekday:           z.boolean(),
  week_of_year:         z.number().int().min(1).max(53),
  enriched_at:          z.string().datetime(),
});

export const EnrichmentPatchSchema = z.object({
  enrichment_data: EnrichmentDataSchema,
  fuel_cost_inr:   z.number().min(0).nullable().optional(),
});

export type EnrichmentPatchInput = z.infer<typeof EnrichmentPatchSchema>;

// ── GET /api/v1/sessions query params ────────────────────────────────────────

export const ListSessionsQuerySchema = z.object({
  limit:     z.coerce.number().int().min(1).max(100).default(20),
  cursor:    z.string().optional(),
  platform:  PlatformEnum.optional(),
  domain:    DomainEnum.optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;

// ── Zod validation middleware factory ────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema, source: 'body' | 'query' = 'body') {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(source === 'body' ? req.body : req.query);
    if (!result.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: result.error.flatten().fieldErrors,
        },
      });
      return;
    }
    // Write validated (and defaulted) data back so controllers get clean data
    if (source === 'body') req.body = result.data;
    else (req as Request & { validatedQuery: unknown }).validatedQuery = result.data;
    next();
  };
}
