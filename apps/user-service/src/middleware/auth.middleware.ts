import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../services/jwt.service";
import { AppError } from "../types/errors";

/**
 * Applies to every endpoint except /auth/*, /health, and the internal
 * GET /users/:id route (CONVENTIONS.md §3, API_CONTRACT.md §0).
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(new AppError("UNAUTHENTICATED", "Missing or malformed Authorization header"));
    return;
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    next();
  } catch (err) {
    next(err);
  }
}
