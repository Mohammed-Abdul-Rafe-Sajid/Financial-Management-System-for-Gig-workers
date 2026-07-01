import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { validateBody } from "../middleware/validate.middleware";
import { requestOtpSchema, verifyOtpSchema, refreshSchema } from "../types/schemas";

const router = Router();

// Auth: none (API_CONTRACT.md §0 — /auth/* is exempt from Bearer auth)
router.post("/auth/request-otp", validateBody(requestOtpSchema), authController.requestOtp);
router.post("/auth/verify-otp", validateBody(verifyOtpSchema), authController.verifyOtp);
router.post("/auth/refresh", validateBody(refreshSchema), authController.refresh);

export default router;
