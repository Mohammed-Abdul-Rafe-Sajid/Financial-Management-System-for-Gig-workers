/**
 * controllers/sessionController.ts
 *
 * Thin layer: parse request → call service → format response.
 * No business logic here. Error codes from API_CONTRACT.md §0.
 */

import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../services/sessionService';
import { ListSessionsQuery, EnrichmentPatchInput } from '../middleware/validation';

export class SessionController {
  constructor(private readonly service: SessionService) {}

  // POST /api/v1/sessions
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;
      const { session } = await this.service.create(userId, req.body);
      res.status(201).json({ data: session });
    } catch (err) {
      next(err);
    }
  };

  // GET /api/v1/sessions
  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;
      const query = (req as Request & { validatedQuery: ListSessionsQuery }).validatedQuery;
      const result = await this.service.list(userId, query);
      res.status(200).json({ data: result.sessions, next_cursor: result.next_cursor });
    } catch (err) {
      next(err);
    }
  };

  // GET /api/v1/sessions/:id
  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;
      const session = await this.service.getById(req.params.id, userId);

      if (!session) {
        res.status(404).json({
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${req.params.id} not found`,
            details: {},
          },
        });
        return;
      }

      // session.user_id check is handled by repo (query includes user_id filter)
      // But if somehow returned, double-check ownership
      if (session.user_id !== userId) {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'You do not own this session', details: {} },
        });
        return;
      }

      res.status(200).json({ data: session });
    } catch (err) {
      next(err);
    }
  };

  // PATCH /api/v1/sessions/:id
  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;
      const session = await this.service.update(req.params.id, userId, req.body);

      if (!session) {
        res.status(404).json({
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${req.params.id} not found or not owned by you`,
            details: {},
          },
        });
        return;
      }

      res.status(200).json({ data: session });
    } catch (err) {
      next(err);
    }
  };

  // DELETE /api/v1/sessions/:id (soft delete)
  softDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.userId!;
      const deleted = await this.service.softDelete(req.params.id, userId);

      if (!deleted) {
        res.status(404).json({
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${req.params.id} not found or not owned by you`,
            details: {},
          },
        });
        return;
      }

      res.status(200).json({ data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  };

  // PATCH /api/v1/sessions/:id/enrichment — internal, service-to-service only
  applyEnrichment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as EnrichmentPatchInput;
      const session = await this.service.applyEnrichment(
        req.params.id,
        body.enrichment_data,
        body.fuel_cost_inr ?? null
      );

      if (!session) {
        res.status(404).json({
          error: {
            code: 'SESSION_NOT_FOUND',
            message: `Session ${req.params.id} not found`,
            details: {},
          },
        });
        return;
      }

      res.status(200).json({ data: session });
    } catch (err) {
      next(err);
    }
  };
}
