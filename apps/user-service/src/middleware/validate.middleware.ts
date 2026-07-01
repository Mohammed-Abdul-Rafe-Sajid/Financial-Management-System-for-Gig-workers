import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import { AppError } from "../types/errors";

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.flatten();
      next(new AppError("VALIDATION_ERROR", "Request body failed validation", { ...details }));
      return;
    }
    req.body = result.data;
    next();
  };
}
