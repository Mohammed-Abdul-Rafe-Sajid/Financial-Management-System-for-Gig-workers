import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(JSON.stringify({
    level: 'error',
    service: config.service_name,
    error: err.message,
    stack: config.node_env === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    user_id: req.userId,
    request_id: req.headers['x-request-id'],
  }));

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: {},
    },
  });
}
