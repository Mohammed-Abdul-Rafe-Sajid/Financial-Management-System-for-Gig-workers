/**
 * routes/sessionRoutes.ts
 *
 * Express router for all session endpoints.
 * Routes are thin: they wire middleware + controller only.
 * Endpoint paths match API_CONTRACT.md §2 exactly.
 */

import { Router } from 'express';
import { SessionController } from '../controllers/sessionController';
import { requireUserAuth, requireServiceAuth } from '../middleware/auth';
import {
  validate,
  CreateSessionSchema,
  UpdateSessionSchema,
  EnrichmentPatchSchema,
  ListSessionsQuerySchema,
} from '../middleware/validation';

export function createSessionRouter(controller: SessionController): Router {
  const router = Router();

  // POST /api/v1/sessions
  router.post(
    '/',
    requireUserAuth,
    validate(CreateSessionSchema, 'body'),
    controller.create
  );

  // GET /api/v1/sessions
  router.get(
    '/',
    requireUserAuth,
    validate(ListSessionsQuerySchema, 'query'),
    controller.list
  );

  // GET /api/v1/sessions/:id
  router.get(
    '/:id',
    requireUserAuth,
    controller.getById
  );

  // PATCH /api/v1/sessions/:id (user corrections)
  router.patch(
    '/:id',
    requireUserAuth,
    validate(UpdateSessionSchema, 'body'),
    controller.update
  );

  // DELETE /api/v1/sessions/:id (soft delete)
  router.delete(
    '/:id',
    requireUserAuth,
    controller.softDelete
  );

  // PATCH /api/v1/sessions/:id/enrichment — internal only
  router.patch(
    '/:id/enrichment',
    requireServiceAuth,
    validate(EnrichmentPatchSchema, 'body'),
    controller.applyEnrichment
  );

  return router;
}
