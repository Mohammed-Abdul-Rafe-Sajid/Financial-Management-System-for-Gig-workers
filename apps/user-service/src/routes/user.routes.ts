import { Router } from "express";
import * as userController from "../controllers/user.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireInternalService } from "../middleware/service-auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { updateMeSchema } from "../types/schemas";

const router = Router();

router.get("/users/me", requireAuth, userController.getMe);
router.patch("/users/me", requireAuth, validateBody(updateMeSchema), userController.updateMe);

// Internal — service-to-service only, NOT user JWT (API_CONTRACT.md §1)
router.get("/users/:id", requireInternalService, userController.getUserByIdInternal);

export default router;
