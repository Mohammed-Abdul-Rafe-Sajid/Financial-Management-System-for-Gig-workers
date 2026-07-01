import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { verifyJwt } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// ─── Redis client for rate limiting ──────────────────────────────────────────
const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);

// ─── Middleware ───────────────────────────────────────────────────────────────

// Request ID — injected into every forwarded request
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);
  next();
});

// CORS
app.use(cors({
  origin: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3100').split(','),
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
  credentials: true,
}));

// Request logging
app.use(morgan(':method :url :status :res[content-length] - :response-time ms [:req[x-request-id]]'));

// Global rate limiter
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
  }),
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down.',
        details: {},
      },
    });
  },
});
app.use(limiter);

// Stricter rate limit on auth endpoints (OTP brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 10,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: 'rl:auth:',
  }),
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many auth attempts. Try again in 15 minutes.', details: {} },
    });
  },
});

// ─── Health (no auth, aggregates all downstream) ─────────────────────────────
app.use('/health', healthRouter);

// ─── Auth routes — no JWT required, stricter rate limit ──────────────────────
app.use(
  '/api/v1/auth',
  authLimiter,
  createProxyMiddleware({
    target: process.env.USER_SERVICE_URL,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader('x-request-id', req.headers['x-request-id'] as string);
      },
      error: (_err, _req, res) => {
        (res as express.Response).status(502).json({
          error: { code: 'INTERNAL_ERROR', message: 'Auth service unavailable', details: {} },
        });
      },
    },
  })
);

// ─── JWT verification for all routes below ───────────────────────────────────
app.use(verifyJwt);

// ─── Proxied service routes ───────────────────────────────────────────────────

function proxy(target: string | undefined, options: object = {}) {
  if (!target) throw new Error('Target URL not configured');
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    ...options,
    on: {
      proxyReq: (proxyReq, req) => {
        // Forward request ID and authenticated user ID to downstream services
        proxyReq.setHeader('x-request-id', req.headers['x-request-id'] as string);
        if ((req as any).userId) {
          proxyReq.setHeader('x-user-id', (req as any).userId);
        }
      },
      error: (_err, _req, res) => {
        (res as express.Response).status(502).json({
          error: { code: 'INTERNAL_ERROR', message: 'Downstream service unavailable', details: {} },
        });
      },
    },
  });
}

app.use('/api/v1/users', proxy(process.env.USER_SERVICE_URL));
app.use('/api/v1/sessions', proxy(process.env.SESSION_SERVICE_URL));
app.use('/api/v1/expenses', proxy(process.env.EXPENSE_SERVICE_URL));
app.use('/api/v1/predictions', proxy(process.env.PREDICTION_SERVICE_URL));
app.use('/api/v1/iss', proxy(process.env.ISS_SERVICE_URL));
app.use('/api/v1/chat', proxy(process.env.CHATBOT_SERVICE_URL));
app.use('/api/v1/dashboard', proxy(process.env.ANALYTICS_SERVICE_URL));
app.use('/api/v1/schemes', proxy(process.env.ANALYTICS_SERVICE_URL));

// ─── 404 catch-all ───────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found', details: {} },
  });
});

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'api-gateway',
    message: `API Gateway listening on port ${PORT}`,
    port: PORT,
  }));
});

export default app;
