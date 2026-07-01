import { Router } from 'express';

const router = Router();

const DOWNSTREAM_SERVICES: Record<string, string> = {
  'user-service':       `${process.env.USER_SERVICE_URL}/health`,
  'session-service':    `${process.env.SESSION_SERVICE_URL}/health`,
  'expense-service':    `${process.env.EXPENSE_SERVICE_URL}/health`,
  'prediction-service': `${process.env.PREDICTION_SERVICE_URL}/health`,
  'iss-service':        `${process.env.ISS_SERVICE_URL}/health`,
  'chatbot-service':    `${process.env.CHATBOT_SERVICE_URL}/health`,
  'analytics-service':  `${process.env.ANALYTICS_SERVICE_URL}/health`,
};

async function checkService(name: string, url: string): Promise<{ name: string; status: string; latency_ms: number }> {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return { name, status: res.ok ? 'ok' : 'degraded', latency_ms: Date.now() - start };
  } catch {
    return { name, status: 'down', latency_ms: Date.now() - start };
  }
}

router.get('/', async (_req, res) => {
  const checks = await Promise.all(
    Object.entries(DOWNSTREAM_SERVICES).map(([name, url]) => checkService(name, url))
  );

  const allOk = checks.every(c => c.status === 'ok');
  const anyDown = checks.some(c => c.status === 'down');

  res.status(allOk ? 200 : anyDown ? 503 : 200).json({
    status: allOk ? 'ok' : anyDown ? 'degraded' : 'partial',
    service: 'api-gateway',
    version: process.env.SERVICE_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
    services: checks,
  });
});

export { router as healthRouter };
