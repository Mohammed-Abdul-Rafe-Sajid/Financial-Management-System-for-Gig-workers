import { Request, Response, NextFunction } from 'express';
import { readFileSync } from 'fs';
import jwt from 'jsonwebtoken';

// Load public key once at startup
let publicKey: string;
try {
  publicKey = readFileSync(process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem', 'utf8');
} catch {
  // Dev fallback: allow JWT_PUBLIC_KEY env var directly
  publicKey = process.env.JWT_PUBLIC_KEY || '';
  if (!publicKey) {
    console.error('FATAL: No JWT public key available. Set JWT_PUBLIC_KEY_PATH or JWT_PUBLIC_KEY.');
    process.exit(1);
  }
}

export interface JwtPayload {
  sub: string;   // user UUID
  phone: string;
  iat: number;
  exp: number;
}

// Extends Express Request to carry authenticated user ID
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function verifyJwt(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Missing or malformed Authorization header',
        details: {},
      },
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as JwtPayload;
    req.userId = payload.sub;
    next();
  } catch (err: any) {
    const isExpired = err?.name === 'TokenExpiredError';
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: isExpired ? 'Token has expired' : 'Invalid token',
        details: {},
      },
    });
  }
}
