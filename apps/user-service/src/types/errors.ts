/**
 * Standard error codes — must match API_CONTRACT.md §0 exactly.
 * user-service only ever throws the subset relevant to auth/users.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "USER_NOT_FOUND"
  | "OTP_INVALID"
  | "OTP_EXPIRED"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

const CODE_TO_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  OTP_INVALID: 400,
  OTP_EXPIRED: 400,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = CODE_TO_STATUS[code];
    this.details = details;
  }
}
