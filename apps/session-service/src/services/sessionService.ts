/**
 * services/sessionService.ts
 *
 * Business logic for session operations.
 * Coordinates repository calls and Kafka event publishing.
 * Controllers call this; this calls repository and kafkaProducer.
 */

import { SessionRepository, CreateSessionInput, UpdateSessionInput } from '../repositories/sessionRepository';
import { kafkaProducer } from '../events/kafkaProducer';
import { encodeCursor, decodeCursor } from '../utils/cursor';
import { WorkSession, EnrichmentData, Platform, Domain } from '../types';
import { ListSessionsQuery } from '../middleware/validation';

export interface CreateSessionResult {
  session: WorkSession;
}

export interface ListSessionsResult {
  sessions: WorkSession[];
  next_cursor: string | null;
}

export class SessionService {
  constructor(private readonly repo: SessionRepository) {}

  async create(
    userId: string,
    input: {
      platform: Platform;
      domain: Domain;
      session_date: string;
      start_time: string;
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
  ): Promise<CreateSessionResult> {
    const createInput: CreateSessionInput = {
      user_id: userId,
      ...input,
    };

    const session = await this.repo.create(createInput);

    // Publish session.created event (API_CONTRACT.md §9)
    // Fire-and-forget — don't let Kafka failure block the HTTP response
    kafkaProducer.publishSessionCreated({
      event_type: 'session.created',
      session_id: session.id,
      user_id: session.user_id,
      session_date: session.session_date,
      city: session.city,
      gps_lat: session.gps_lat,
      gps_lng: session.gps_lng,
      timestamp: new Date().toISOString(),
    }).catch((err) => {
      console.error(JSON.stringify({
        level: 'error',
        service: 'session-service',
        message: 'Failed to publish session.created',
        session_id: session.id,
        error: String(err),
      }));
    });

    return { session };
  }

  async getById(sessionId: string, userId: string): Promise<WorkSession | null> {
    return this.repo.findById(sessionId, userId);
  }

  async list(userId: string, query: ListSessionsQuery): Promise<ListSessionsResult> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

    const { sessions, nextCursor } = await this.repo.list({
      user_id: userId,
      platform: query.platform,
      domain: query.domain,
      from_date: query.from_date,
      to_date: query.to_date,
      limit: query.limit,
      cursor: cursor ?? undefined,
    });

    return {
      sessions,
      next_cursor: nextCursor ? encodeCursor(nextCursor) : null,
    };
  }

  async update(
    sessionId: string,
    userId: string,
    input: UpdateSessionInput
  ): Promise<WorkSession | null> {
    return this.repo.update(sessionId, userId, input);
  }

  async softDelete(sessionId: string, userId: string): Promise<boolean> {
    return this.repo.softDelete(sessionId, userId);
  }

  async applyEnrichment(
    sessionId: string,
    enrichmentData: EnrichmentData,
    fuelCostInr: number | null
  ): Promise<WorkSession | null> {
    const session = await this.repo.applyEnrichment(sessionId, enrichmentData, fuelCostInr);

    if (session) {
      // Publish session.enriched (API_CONTRACT.md §9)
      kafkaProducer.publishSessionEnriched({
        event_type: 'session.enriched',
        session_id: session.id,
        user_id: session.user_id,
        timestamp: new Date().toISOString(),
      }).catch((err) => {
        console.error(JSON.stringify({
          level: 'error',
          service: 'session-service',
          message: 'Failed to publish session.enriched',
          session_id: session.id,
          error: String(err),
        }));
      });

      // Also publish prediction.requested to prompt prediction-service to update feature store
      kafkaProducer.publishPredictionRequested({
        event_type: 'prediction.requested',
        user_id: session.user_id,
        trigger_reason: 'new_session',
        timestamp: new Date().toISOString(),
      }).catch(() => {/* best-effort */});
    }

    return session;
  }
}
