import { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { AppError } from "../types/errors";

/**
 * ⚠️ SPEC GAP: API_CONTRACT.md marks GET /api/v1/users/:id as "internal —
 * for service-to-service calls only, requires service auth token, not user
 * JWT" but does not define the token format. Implemented as a shared static
 * bearer secret (INTERNAL_SERVICE_TOKEN) presented by calling services.
 * If a real service-mesh / mTLS / per-service-signed-JWT scheme is adopted
 * project-wide, this middleware is the only place that needs to change.
 */
export function requireInternalService(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    next(new AppError("UNAUTHENTICATED", "Missing service auth token"));
    return;
  }

  const token = header.slice("Bearer ".length);
  if (token !== config.internalServiceToken) {
    next(new AppError("FORBIDDEN", "Invalid service auth token"));
    return;
  }

  req.isInternalService = true;
  next();
}
