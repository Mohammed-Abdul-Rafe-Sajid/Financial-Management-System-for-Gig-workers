import { NextFunction, Request, Response } from "express";
import { AppError } from "../types/errors";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route matches ${req.method} ${req.path}`,
      details: {},
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  const error = err as Error;
  // Structured log per CONVENTIONS.md §6 — never leak stack traces to the client.
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      service: "user-service",
      error_code: "INTERNAL_ERROR",
      message: error?.message ?? "Unknown error",
      user_id: req.userId ?? null,
      path: req.path,
    })
  );

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again.",
      details: {},
    },
  });
}

/** Wraps async route handlers so rejected promises reach errorHandler. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
