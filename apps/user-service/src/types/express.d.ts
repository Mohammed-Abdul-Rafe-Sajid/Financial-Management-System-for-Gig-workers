import "express";

declare global {
  namespace Express {
    interface Request {
      /** Populated by middleware/auth.middleware.ts after JWT verification */
      userId?: string;
      /** Populated by middleware/service-auth.middleware.ts */
      isInternalService?: boolean;
    }
  }
}

export {};
