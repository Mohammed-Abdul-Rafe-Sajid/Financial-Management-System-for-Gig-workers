import { Request, Response } from "express";
import { asyncHandler } from "../middleware/error.middleware";
import * as userService from "../services/user.service";
import { UpdateMeBody } from "../types/schemas";
import { AppError } from "../types/errors";

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await userService.getUserById(req.userId as string);
  res.status(200).json({ data: user });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const patch = req.body as UpdateMeBody;
  const user = await userService.updateCurrentUser(req.userId as string, patch);
  res.status(200).json({ data: user });
});

/** Internal endpoint — service-to-service only (see service-auth.middleware.ts) */
export const getUserByIdInternal = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    throw new AppError("VALIDATION_ERROR", "id path parameter is required");
  }
  const user = await userService.getUserById(id);
  res.status(200).json({ data: user });
});
