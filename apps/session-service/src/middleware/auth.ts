/**
 * middleware/auth.ts
 *
 * JWT validation middleware for session-service.
 * ONLY validates — never generates tokens (that is user-service's job).
 * Uses the RS256 public key loaded at startup.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JwtPayload } from '../types';

// Extend Express Request to carry the authenticated user's ID
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireUserAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: 'Missing or malformed Authorization header',
        details: {},
      },
    });
    return;
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt_public_key, {
      algorithms: ['RS256'],
    }) as JwtPayload;
    req.userId = payload.sub;
    next();
  } catch (err: unknown) {
    const isExpired = err instanceof Error && err.name === 'TokenExpiredError';
    res.status(401).json({
      error: {
        code: 'UNAUTHENTICATED',
        message: isExpired ? 'Token has expired' : 'Invalid token',
        details: {},
      },
    });
  }
}

/**
 * requireServiceAuth — for internal endpoints called by other services only.
 * Uses the shared SERVICE_SECRET (API_CONTRACT.md §0).
 */
export function requireServiceAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({
      error: { code: 'UNAUTHENTICATED', message: 'Missing Authorization header', details: {} },
    });
    return;
  }

  const token = header.slice(7);

  if (token !== config.service_secret) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Invalid service token', details: {} },
    });
    return;
  }

  next();
}
