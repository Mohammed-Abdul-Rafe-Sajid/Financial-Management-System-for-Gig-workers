import { redisClient } from "./redis.client";
import { config } from "../config";
import { generateOtp, enforceRateLimit, storeOtp, verifyAndConsumeOtp } from "./otp.service";
import { sendOtpSms } from "./sms.service";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "./jwt.service";
import { findOrCreateUserByPhone } from "../repositories/user.repository";
import { User } from "../types/user";
import { AppError } from "../types/errors";

const refreshAllowListKey = (jti: string) => `refresh:${jti}`;

export async function requestOtp(phoneNumber: string): Promise<{ otp_sent: true; expires_in_seconds: number }> {
  await enforceRateLimit(phoneNumber);
  const otp = generateOtp();
  await storeOtp(phoneNumber, otp);
  await sendOtpSms(phoneNumber, otp);
  return { otp_sent: true, expires_in_seconds: config.otp.ttlSeconds };
}

export interface VerifyOtpResult {
  access_token: string;
  refresh_token: string;
  expires_in_seconds: number;
  user: User;
}

export async function verifyOtp(phoneNumber: string, otp: string): Promise<VerifyOtpResult> {
  await verifyAndConsumeOtp(phoneNumber, otp);

  // ⚠️ SPEC GAP: contract doesn't say whether verify-otp should auto-create
  // a user on first-ever login. Implemented as upsert (OTP is the only
  // signup path), consistent with "minimal manual input" principle in the PRD.
  const { user } = await findOrCreateUserByPhone(phoneNumber);

  const access = signAccessToken(user.id);
  const refresh = signRefreshToken(user.id);

  await redisClient.set(refreshAllowListKey(refresh.jti), user.id, { EX: refresh.expiresInSeconds });

  return {
    access_token: access.token,
    refresh_token: refresh.token,
    expires_in_seconds: access.expiresInSeconds,
    user,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in_seconds: number }> {
  const payload = verifyRefreshToken(refreshToken);

  const storedUserId = await redisClient.get(refreshAllowListKey(payload.jti));
  if (!storedUserId || storedUserId !== payload.sub) {
    throw new AppError("UNAUTHENTICATED", "Refresh token has been revoked or expired");
  }

  const access = signAccessToken(payload.sub);
  return { access_token: access.token, expires_in_seconds: access.expiresInSeconds };
}
