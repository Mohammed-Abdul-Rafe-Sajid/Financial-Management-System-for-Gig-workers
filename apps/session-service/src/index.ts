import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config';
import { pool } from './repositories/db';
import { SessionRepository } from './repositories/sessionRepository';
import { SessionService } from './services/sessionService';
import { SessionController } from './controllers/sessionController';
import { createSessionRouter } from './routes/sessionRoutes';
import { healthRouter } from './routes/health';
import { errorHandler } from './middleware/errorHandler';
import { kafkaProducer } from './events/kafkaProducer';

async function bootstrap(): Promise<void> {
  // ── Connect Kafka producer ──────────────────────────────────────────────────
  try {
    await kafkaProducer.connect();
  } catch (err) {
    // Non-fatal at startup: service can still handle requests, events just won't publish
    console.error(JSON.stringify({
      level: 'warn',
      service: config.service_name,
      message: 'Kafka producer failed to connect at startup — will retry on publish',
      error: String(err),
    }));
  }

  // ── Wire dependencies ───────────────────────────────────────────────────────
  const sessionRepo       = new SessionRepository(pool);
  const sessionService    = new SessionService(sessionRepo);
  const sessionController = new SessionController(sessionService);

  // ── Express app ─────────────────────────────────────────────────────────────
  const app = express();

  app.use(express.json());
  app.use(cors());
  app.use(morgan(':method :url :status - :response-time ms [:req[x-request-id]]'));

  // Health — no auth
  app.use('/health', healthRouter);

  // Session CRUD
  app.use('/api/v1/sessions', createSessionRouter(sessionController));

  // 404 catch-all
  app.use((_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Route not found', details: {} },
    });
  });

  app.use(errorHandler);

  // ── Start server ────────────────────────────────────────────────────────────
  const server = app.listen(config.port, () => {
    console.log(JSON.stringify({
      level: 'info',
      service: config.service_name,
      message: `session-service listening on port ${config.port}`,
      port: config.port,
      node_env: config.node_env,
    }));
  });

  // ── Graceful shutdown ────────────────────────────────────────────────────────
  async function shutdown(signal: string): Promise<void> {
    console.log(JSON.stringify({
      level: 'info',
      service: config.service_name,
      message: `${signal} received, shutting down gracefully`,
    }));
    server.close(async () => {
      await kafkaProducer.disconnect();
      await pool.end();
      process.exit(0);
    });
    // Force exit after 10s if graceful shutdown hangs
    setTimeout(() => process.exit(1), 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error(JSON.stringify({
    level: 'fatal',
    service: 'session-service',
    message: 'Failed to start',
    error: String(err),
  }));
  process.exit(1);
});
