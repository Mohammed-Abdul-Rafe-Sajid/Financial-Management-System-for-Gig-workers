/**
 * repositories/sessionRepository.ts
 *
 * All database access for the work_sessions table.
 * This is the ONLY file that may touch work_sessions directly.
 * Uses parameterized queries only — no string interpolation of user input.
 *
 * CONVENTIONS.md §2: money values use pg's built-in decimal parsing.
 * CONVENTIONS.md §2: computed columns (net_platform_earnings_inr,
 *   net_earnings_after_fuel_inr) are DB GENERATED — never written by code.
 */

import { Pool, QueryResult } from 'pg';
import { WorkSession, EnrichmentData, CursorPayload, Platform, Domain } from '../types';

// ── Row → domain type mapper ──────────────────────────────────────────────────
// pg returns DECIMAL columns as strings; cast them explicitly.
function rowToSession(row: Record<string, unknown>): WorkSession {
  return {
    id:                          row.id as string,
    user_id:                     row.user_id as string,
    platform:                    row.platform as WorkSession['platform'],
    domain:                      row.domain as WorkSession['domain'],
    session_date:                (row.session_date as Date).toISOString().split('T')[0],
    start_time:                  (row.start_time as Date).toISOString(),
    end_time:                    row.end_time ? (row.end_time as Date).toISOString() : null,
    gross_earnings_inr:          parseFloat(row.gross_earnings_inr as string),
    platform_commission_inr:     row.platform_commission_inr != null
                                   ? parseFloat(row.platform_commission_inr as string) : null,
    incentive_inr:               parseFloat(row.incentive_inr as string),
    net_platform_earnings_inr:   parseFloat(row.net_platform_earnings_inr as string),
    distance_km:                 row.distance_km != null
                                   ? parseFloat(row.distance_km as string) : null,
    fuel_cost_inr:               row.fuel_cost_inr != null
                                   ? parseFloat(row.fuel_cost_inr as string) : null,
    net_earnings_after_fuel_inr: row.net_earnings_after_fuel_inr != null
                                   ? parseFloat(row.net_earnings_after_fuel_inr as string) : null,
    trips_or_jobs_count:         row.trips_or_jobs_count != null
                                   ? parseInt(row.trips_or_jobs_count as string, 10) : null,
    city:                        (row.city as string | null) ?? null,
    zone:                        (row.zone as string | null) ?? null,
    gps_lat:                     row.gps_lat != null
                                   ? parseFloat(row.gps_lat as string) : null,
    gps_lng:                     row.gps_lng != null
                                   ? parseFloat(row.gps_lng as string) : null,
    enrichment_data:             (row.enrichment_data as EnrichmentData | null) ?? null,
    enrichment_status:           row.enrichment_status as WorkSession['enrichment_status'],
    created_at:                  (row.created_at as Date).toISOString(),
    deleted_at:                  row.deleted_at
                                   ? (row.deleted_at as Date).toISOString() : null,
  };
}

// ── Create input type ─────────────────────────────────────────────────────────

export interface CreateSessionInput {
  user_id: string;
  platform: Platform;
  domain: Domain;
  session_date: string;           // YYYY-MM-DD
  start_time: string;             // ISO 8601
  end_time?: string | null;
  gross_earnings_inr: number;
  platform_commission_inr?: number | null;
  incentive_inr?: number;
  distance_km?: number | null;
  trips_or_jobs_count?: number | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  city?: string | null;
}

export interface UpdateSessionInput {
  gross_earnings_inr?: number;
  distance_km?: number | null;
  trips_or_jobs_count?: number | null;
}

export interface ListSessionsFilter {
  user_id: string;
  platform?: Platform;
  domain?: Domain;
  from_date?: string;
  to_date?: string;
  limit: number;
  cursor?: CursorPayload;
}

// ── Repository class ──────────────────────────────────────────────────────────

export class SessionRepository {
  constructor(private readonly db: Pool) {}

  async create(input: CreateSessionInput): Promise<WorkSession> {
    const result: QueryResult = await this.db.query(
      `INSERT INTO work_sessions (
        user_id, platform, domain, session_date, start_time, end_time,
        gross_earnings_inr, platform_commission_inr, incentive_inr,
        distance_km, trips_or_jobs_count, gps_lat, gps_lng, city
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11, $12, $13, $14
      )
      RETURNING *`,
      [
        input.user_id,
        input.platform,
        input.domain,
        input.session_date,
        input.start_time,
        input.end_time ?? null,
        input.gross_earnings_inr,
        input.platform_commission_inr ?? null,
        input.incentive_inr ?? 0,
        input.distance_km ?? null,
        input.trips_or_jobs_count ?? null,
        input.gps_lat ?? null,
        input.gps_lng ?? null,
        input.city ?? null,
      ]
    );
    return rowToSession(result.rows[0]);
  }

  async findById(id: string, userId: string): Promise<WorkSession | null> {
    const result = await this.db.query(
      `SELECT * FROM work_sessions
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId]
    );
    return result.rows.length ? rowToSession(result.rows[0]) : null;
  }

  // findByIdAny: used for internal enrichment PATCH — no user_id filter needed
  async findByIdAny(id: string): Promise<WorkSession | null> {
    const result = await this.db.query(
      `SELECT * FROM work_sessions WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows.length ? rowToSession(result.rows[0]) : null;
  }

  async list(filter: ListSessionsFilter): Promise<{ sessions: WorkSession[]; nextCursor: CursorPayload | null }> {
    const params: unknown[] = [filter.user_id, filter.limit + 1]; // +1 to detect next page
    let paramIdx = 3;
    const conditions: string[] = ['user_id = $1', 'deleted_at IS NULL'];

    if (filter.platform) {
      conditions.push(`platform = $${paramIdx++}`);
      params.push(filter.platform);
    }
    if (filter.domain) {
      conditions.push(`domain = $${paramIdx++}`);
      params.push(filter.domain);
    }
    if (filter.from_date) {
      conditions.push(`session_date >= $${paramIdx++}`);
      params.push(filter.from_date);
    }
    if (filter.to_date) {
      conditions.push(`session_date <= $${paramIdx++}`);
      params.push(filter.to_date);
    }

    // Cursor: keyset pagination — items older than cursor (created_at DESC, id DESC)
    if (filter.cursor) {
      conditions.push(
        `(created_at, id) < ($${paramIdx++}::timestamptz, $${paramIdx++}::uuid)`
      );
      params.push(filter.cursor.created_at, filter.cursor.id);
    }

    const where = conditions.join(' AND ');
    const result = await this.db.query(
      `SELECT * FROM work_sessions
       WHERE ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      params
    );

    const rows = result.rows.map(rowToSession);
    const hasMore = rows.length > filter.limit;
    if (hasMore) rows.pop(); // remove the extra row used for next-page detection

    const nextCursor: CursorPayload | null = hasMore
      ? { id: rows[rows.length - 1].id, created_at: rows[rows.length - 1].created_at }
      : null;

    return { sessions: rows, nextCursor };
  }

  async update(id: string, userId: string, input: UpdateSessionInput): Promise<WorkSession | null> {
    // Build dynamic SET clause from whichever fields are present
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (input.gross_earnings_inr !== undefined) {
      setClauses.push(`gross_earnings_inr = $${idx++}`);
      params.push(input.gross_earnings_inr);
    }
    if (input.distance_km !== undefined) {
      setClauses.push(`distance_km = $${idx++}`);
      params.push(input.distance_km);
    }
    if (input.trips_or_jobs_count !== undefined) {
      setClauses.push(`trips_or_jobs_count = $${idx++}`);
      params.push(input.trips_or_jobs_count);
    }

    if (setClauses.length === 0) return null; // nothing to update

    params.push(id, userId); // WHERE clause params

    const result = await this.db.query(
      `UPDATE work_sessions
       SET ${setClauses.join(', ')}
       WHERE id = $${idx++} AND user_id = $${idx++} AND deleted_at IS NULL
       RETURNING *`,
      params
    );
    return result.rows.length ? rowToSession(result.rows[0]) : null;
  }

  async softDelete(id: string, userId: string): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE work_sessions
       SET deleted_at = NOW()
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  async applyEnrichment(
    id: string,
    enrichmentData: EnrichmentData,
    fuelCostInr: number | null
  ): Promise<WorkSession | null> {
    const result = await this.db.query(
      `UPDATE work_sessions
       SET enrichment_data = $1,
           fuel_cost_inr   = $2,
           enrichment_status = 'enriched'
       WHERE id = $3 AND deleted_at IS NULL
       RETURNING *`,
      [JSON.stringify(enrichmentData), fuelCostInr, id]
    );
    return result.rows.length ? rowToSession(result.rows[0]) : null;
  }

  async markEnrichmentFailed(id: string): Promise<void> {
    await this.db.query(
      `UPDATE work_sessions SET enrichment_status = 'failed' WHERE id = $1`,
      [id]
    );
  }
}
