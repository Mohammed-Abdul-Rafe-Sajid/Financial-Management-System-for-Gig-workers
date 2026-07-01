import { redisClient } from "./redis.client";
import { config } from "../config";
import { AppError } from "../types/errors";

const otpKey = (phone: string) => `otp:${phone}`;
const rateLimitKey = (phone: string) => `otp:ratelimit:${phone}`;

export function generateOtp(): string {
  // 6-digit numeric, zero-padded
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Enforces API_CONTRACT.md §1: max 5 requests / 15 min / phone number.
 * Uses a Redis counter with a sliding-ish fixed window (INCR + EXPIRE NX).
 */
export async function enforceRateLimit(phoneNumber: string): Promise<void> {
  const key = rateLimitKey(phoneNumber);
  const count = await redisClient.incr(key);
  if (count === 1) {
    await redisClient.expire(key, config.otp.rateLimitWindowSeconds);
  }
  if (count > config.otp.rateLimitMaxRequests) {
    throw new AppError("RATE_LIMITED", "Too many OTP requests for this phone number. Try again later.", {
      max_requests: config.otp.rateLimitMaxRequests,
      window_seconds: config.otp.rateLimitWindowSeconds,
    });
  }
}

export async function storeOtp(phoneNumber: string, otp: string): Promise<void> {
  await redisClient.set(otpKey(phoneNumber), otp, { EX: config.otp.ttlSeconds });
}

/**
 * Verifies the OTP and consumes it (deletes on success so it can't be replayed).
 * Throws OTP_EXPIRED if no OTP is on file, OTP_INVALID on mismatch.
 */
export async function verifyAndConsumeOtp(phoneNumber: string, submittedOtp: string): Promise<void> {
  const key = otpKey(phoneNumber);
  const storedOtp = await redisClient.get(key);

  if (!storedOtp) {
    throw new AppError("OTP_EXPIRED", "OTP has expired or was never requested");
  }
  if (storedOtp !== submittedOtp) {
    throw new AppError("OTP_INVALID", "Incorrect OTP");
  }
  await redisClient.del(key);
}
