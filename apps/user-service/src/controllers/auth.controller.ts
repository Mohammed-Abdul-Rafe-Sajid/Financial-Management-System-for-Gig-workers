import { Request, Response } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import * as authService from "../services/auth.service";
import { RequestOtpBody, RefreshBody, VerifyOtpBody } from "../types/schemas";

export const requestOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone_number } = req.body as RequestOtpBody;
  const result = await authService.requestOtp(phone_number);
  res.status(200).json({ data: result });
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { phone_number, otp } = req.body as VerifyOtpBody;
  const result = await authService.verifyOtp(phone_number, otp);
  res.status(200).json({ data: result });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refresh_token } = req.body as RefreshBody;
  const result = await authService.refreshAccessToken(refresh_token);
  res.status(200).json({ data: result });
});
