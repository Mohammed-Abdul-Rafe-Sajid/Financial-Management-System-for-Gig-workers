import { Router, Request, Response } from 'express';
import { config } from '../config';
import { pool } from '../repositories/db';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  // Verify DB connectivity as part of health
  let db_status = 'ok';
  try {
    await pool.query('SELECT 1');
  } catch {
    db_status = 'down';
  }

  const status = db_status === 'ok' ? 'ok' : 'degraded';
  res.status(status === 'ok' ? 200 : 503).json({
    status,
    service: config.service_name,
    version: config.service_version,
    timestamp: new Date().toISOString(),
    checks: { database: db_status },
  });
});

export { router as healthRouter };
