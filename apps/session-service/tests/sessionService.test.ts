/**
 * tests/sessionService.test.ts
 *
 * Unit tests for SessionService — all business logic is here.
 * Repository and Kafka producer are mocked so no real DB or Kafka needed.
 */

import { SessionService } from '../src/services/sessionService';
import { SessionRepository } from '../src/repositories/sessionRepository';
import { kafkaProducer } from '../src/events/kafkaProducer';
import { WorkSession } from '../src/types';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../src/repositories/sessionRepository');
jest.mock('../src/events/kafkaProducer', () => ({
  kafkaProducer: {
    publishSessionCreated:    jest.fn().mockResolvedValue(undefined),
    publishSessionEnriched:   jest.fn().mockResolvedValue(undefined),
    publishPredictionRequested: jest.fn().mockResolvedValue(undefined),
  },
}));
// Config mock — avoids needing real env vars or key files during tests
jest.mock('../src/config', () => ({
  config: {
    node_env:        'test',
    port:            3002,
    service_name:    'session-service',
    service_version: '1.0.0',
    database_url:    'postgresql://test',
    kafka:           { brokers: ['localhost:9092'], client_id: 'session-service' },
    jwt_public_key:  '-----BEGIN PUBLIC KEY-----\nMOCK\n-----END PUBLIC KEY-----',
    service_secret:  'test_service_secret',
  },
}));

// ── Fixtures ───────────────────────────────────────────────────────────────────

const MOCK_USER_ID = 'user-uuid-1234';
const MOCK_SESSION_ID = 'session-uuid-5678';

function makeSession(overrides: Partial<WorkSession> = {}): WorkSession {
  return {
    id:                          MOCK_SESSION_ID,
    user_id:                     MOCK_USER_ID,
    platform:                    'rapido',
    domain:                      'ride_hailing',
    session_date:                '2026-06-30',
    start_time:                  '2026-06-30T08:00:00.000Z',
    end_time:                    '2026-06-30T11:00:00.000Z',
    gross_earnings_inr:          450.00,
    platform_commission_inr:     90.00,
    incentive_inr:               50.00,
    net_platform_earnings_inr:   410.00,
    distance_km:                 32.5,
    fuel_cost_inr:               85.00,
    net_earnings_after_fuel_inr: 325.00,
    trips_or_jobs_count:         6,
    city:                        'Hyderabad',
    zone:                        'Banjara Hills',
    gps_lat:                     17.385044,
    gps_lng:                     78.486671,
    enrichment_data:             null,
    enrichment_status:           'pending',
    created_at:                  '2026-06-30T08:00:00.000Z',
    deleted_at:                  null,
    ...overrides,
  };
}

// ── Setup ──────────────────────────────────────────────────────────────────────

let service: SessionService;
let mockRepo: jest.Mocked<SessionRepository>;

beforeEach(() => {
  jest.clearAllMocks();
  // Cast via unknown to avoid MockedClass generic incompatibility with ts-jest
  mockRepo = new (SessionRepository as jest.MockedClass<typeof SessionRepository>)(
    null as never
  ) as unknown as jest.Mocked<SessionRepository>;
  service = new SessionService(mockRepo);
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SessionService.create', () => {
  it('creates a session and returns it', async () => {
    const session = makeSession();
    mockRepo.create.mockResolvedValue(session);

    const result = await service.create(MOCK_USER_ID, {
      platform:           'rapido',
      domain:             'ride_hailing',
      session_date:       '2026-06-30',
      start_time:         '2026-06-30T08:00:00Z',
      gross_earnings_inr: 450.00,
    });

    expect(result.session).toEqual(session);
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: MOCK_USER_ID, platform: 'rapido' })
    );
  });

  it('publishes session.created Kafka event after creation', async () => {
    mockRepo.create.mockResolvedValue(makeSession());

    await service.create(MOCK_USER_ID, {
      platform:           'rapido',
      domain:             'ride_hailing',
      session_date:       '2026-06-30',
      start_time:         '2026-06-30T08:00:00Z',
      gross_earnings_inr: 450.00,
    });

    // Wait a tick for the fire-and-forget publish
    await new Promise((r) => setImmediate(r));

    expect(kafkaProducer.publishSessionCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'session.created',
        session_id: MOCK_SESSION_ID,
        user_id:    MOCK_USER_ID,
      })
    );
  });

  it('still returns session if Kafka publish fails', async () => {
    mockRepo.create.mockResolvedValue(makeSession());
    (kafkaProducer.publishSessionCreated as jest.Mock).mockRejectedValue(
      new Error('Kafka down')
    );

    const result = await service.create(MOCK_USER_ID, {
      platform:           'rapido',
      domain:             'ride_hailing',
      session_date:       '2026-06-30',
      start_time:         '2026-06-30T08:00:00Z',
      gross_earnings_inr: 450.00,
    });

    expect(result.session.id).toBe(MOCK_SESSION_ID);
  });

  it('passes incentive_inr through to repo when provided', async () => {
    // Note: incentive_inr default (0) is applied by Zod schema in the validation
    // middleware layer, before reaching the service. The service passes through
    // whatever it receives — this test verifies that pass-through behaviour.
    mockRepo.create.mockResolvedValue(makeSession({ incentive_inr: 75.00 }));

    await service.create(MOCK_USER_ID, {
      platform:           'swiggy',
      domain:             'food_delivery',
      session_date:       '2026-06-30',
      start_time:         '2026-06-30T12:00:00Z',
      gross_earnings_inr: 300.00,
      incentive_inr:      75.00,
    });

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ incentive_inr: 75.00 })
    );
  });
});

describe('SessionService.getById', () => {
  it('returns session when found', async () => {
    const session = makeSession();
    mockRepo.findById.mockResolvedValue(session);

    const result = await service.getById(MOCK_SESSION_ID, MOCK_USER_ID);
    expect(result).toEqual(session);
    expect(mockRepo.findById).toHaveBeenCalledWith(MOCK_SESSION_ID, MOCK_USER_ID);
  });

  it('returns null when session not found', async () => {
    mockRepo.findById.mockResolvedValue(null);
    const result = await service.getById('nonexistent-id', MOCK_USER_ID);
    expect(result).toBeNull();
  });
});

describe('SessionService.list', () => {
  it('returns sessions and null next_cursor for last page', async () => {
    const sessions = [makeSession(), makeSession({ id: 'session-uuid-9999' })];
    mockRepo.list.mockResolvedValue({ sessions, nextCursor: null });

    const result = await service.list(MOCK_USER_ID, {
      limit: 20,
      cursor: undefined,
      platform: undefined,
      domain: undefined,
      from_date: undefined,
      to_date: undefined,
    });

    expect(result.sessions).toHaveLength(2);
    expect(result.next_cursor).toBeNull();
  });

  it('encodes next_cursor as opaque base64url string', async () => {
    const sessions = [makeSession()];
    mockRepo.list.mockResolvedValue({
      sessions,
      nextCursor: { id: MOCK_SESSION_ID, created_at: '2026-06-30T08:00:00.000Z' },
    });

    const result = await service.list(MOCK_USER_ID, { limit: 1 });

    expect(result.next_cursor).toBeTruthy();
    expect(typeof result.next_cursor).toBe('string');
    // Verify it's valid base64url by decoding it
    const decoded = JSON.parse(
      Buffer.from(result.next_cursor!, 'base64url').toString('utf8')
    );
    expect(decoded.id).toBe(MOCK_SESSION_ID);
  });

  it('decodes and passes cursor to repository', async () => {
    mockRepo.list.mockResolvedValue({ sessions: [], nextCursor: null });
    const cursorStr = Buffer.from(
      JSON.stringify({ id: MOCK_SESSION_ID, created_at: '2026-06-30T08:00:00.000Z' })
    ).toString('base64url');

    await service.list(MOCK_USER_ID, { limit: 20, cursor: cursorStr });

    expect(mockRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: MOCK_SESSION_ID, created_at: '2026-06-30T08:00:00.000Z' },
      })
    );
  });

  it('passes platform and date filters to repository', async () => {
    mockRepo.list.mockResolvedValue({ sessions: [], nextCursor: null });

    await service.list(MOCK_USER_ID, {
      limit: 10,
      platform: 'swiggy',
      from_date: '2026-06-01',
      to_date: '2026-06-30',
    });

    expect(mockRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({
        platform:  'swiggy',
        from_date: '2026-06-01',
        to_date:   '2026-06-30',
      })
    );
  });
});

describe('SessionService.update', () => {
  it('returns updated session', async () => {
    const updated = makeSession({ gross_earnings_inr: 500.00 });
    mockRepo.update.mockResolvedValue(updated);

    const result = await service.update(MOCK_SESSION_ID, MOCK_USER_ID, {
      gross_earnings_inr: 500.00,
    });

    expect(result?.gross_earnings_inr).toBe(500.00);
  });

  it('returns null when session not found', async () => {
    mockRepo.update.mockResolvedValue(null);
    const result = await service.update('nonexistent', MOCK_USER_ID, {
      gross_earnings_inr: 500.00,
    });
    expect(result).toBeNull();
  });
});

describe('SessionService.softDelete', () => {
  it('returns true when successfully deleted', async () => {
    mockRepo.softDelete.mockResolvedValue(true);
    const result = await service.softDelete(MOCK_SESSION_ID, MOCK_USER_ID);
    expect(result).toBe(true);
  });

  it('returns false when session not found or not owned', async () => {
    mockRepo.softDelete.mockResolvedValue(false);
    const result = await service.softDelete('nonexistent', MOCK_USER_ID);
    expect(result).toBe(false);
  });
});

describe('SessionService.applyEnrichment', () => {
  const enrichmentData = {
    weather_condition:    'clear' as const,
    temperature_celsius:  32,
    is_public_holiday:    false,
    is_festival_period:   false,
    holiday_name:         null,
    traffic_index:        0.4,
    fuel_price_per_litre: 104.5,
    day_of_week:          0,
    is_weekday:           true,
    week_of_year:         26,
    enriched_at:          '2026-06-30T08:05:00.000Z',
  };

  it('applies enrichment and returns updated session', async () => {
    const enriched = makeSession({
      enrichment_data:   enrichmentData,
      enrichment_status: 'enriched',
      fuel_cost_inr:     85.5,
    });
    mockRepo.applyEnrichment.mockResolvedValue(enriched);

    const result = await service.applyEnrichment(MOCK_SESSION_ID, enrichmentData, 85.5);

    expect(result?.enrichment_status).toBe('enriched');
    expect(result?.fuel_cost_inr).toBe(85.5);
  });

  it('publishes session.enriched and prediction.requested after enrichment', async () => {
    const enriched = makeSession({ enrichment_status: 'enriched' });
    mockRepo.applyEnrichment.mockResolvedValue(enriched);

    await service.applyEnrichment(MOCK_SESSION_ID, enrichmentData, 85.5);
    await new Promise((r) => setImmediate(r));

    expect(kafkaProducer.publishSessionEnriched).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'session.enriched',
        session_id: MOCK_SESSION_ID,
      })
    );
    expect(kafkaProducer.publishPredictionRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type:     'prediction.requested',
        trigger_reason: 'new_session',
      })
    );
  });

  it('returns null when session not found', async () => {
    mockRepo.applyEnrichment.mockResolvedValue(null);
    const result = await service.applyEnrichment('nonexistent', enrichmentData, null);
    expect(result).toBeNull();
    expect(kafkaProducer.publishSessionEnriched).not.toHaveBeenCalled();
  });
});

describe('cursor encoding/decoding', () => {
  // Testing the cursor utilities directly
  const { encodeCursor, decodeCursor } = require('../src/utils/cursor');

  it('round-trips cursor encoding', () => {
    const payload = { id: 'abc-123', created_at: '2026-06-30T08:00:00Z' };
    const encoded = encodeCursor(payload);
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(payload);
  });

  it('returns null for invalid cursor', () => {
    expect(decodeCursor('not-valid-base64!!!')).toBeNull();
    expect(decodeCursor(btoa('{"invalid":true}'))).toBeNull();
  });
});
