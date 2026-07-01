jest.mock("../src/services/redis.client", () => ({
  redisClient: { set: jest.fn(), get: jest.fn() },
}));
jest.mock("../src/services/otp.service", () => ({
  generateOtp: jest.fn(() => "123456"),
  enforceRateLimit: jest.fn(),
  storeOtp: jest.fn(),
  verifyAndConsumeOtp: jest.fn(),
}));
jest.mock("../src/services/sms.service", () => ({
  sendOtpSms: jest.fn(),
}));
jest.mock("../src/services/jwt.service", () => ({
  signAccessToken: jest.fn(() => ({ token: "access.token", expiresInSeconds: 900 })),
  signRefreshToken: jest.fn(() => ({ token: "refresh.token", jti: "jti-123", expiresInSeconds: 604800 })),
  verifyRefreshToken: jest.fn(),
}));
jest.mock("../src/repositories/user.repository", () => ({
  findOrCreateUserByPhone: jest.fn(),
}));
jest.mock("../src/config", () => ({
  config: { otp: { ttlSeconds: 300 } },
}));

import { redisClient } from "../src/services/redis.client";
import * as otpService from "../src/services/otp.service";
import * as smsService from "../src/services/sms.service";
import * as jwtService from "../src/services/jwt.service";
import * as userRepository from "../src/repositories/user.repository";
import { requestOtp, verifyOtp, refreshAccessToken } from "../src/services/auth.service";
import { User } from "../src/types/user";

const mockedRedis = redisClient as unknown as { set: jest.Mock; get: jest.Mock };

const sampleUser: User = {
  id: "11111111-1111-4111-8111-111111111111",
  phone_number: "+919876543210",
  email: null,
  name: null,
  preferred_language: "en",
  city: null,
  vehicle_type: "none",
  active_platforms: [],
  active_domains: [],
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("auth.service", () => {
  describe("requestOtp", () => {
    it("rate-limits, generates, stores, and sends the OTP", async () => {
      const result = await requestOtp("+919876543210");
      expect(otpService.enforceRateLimit).toHaveBeenCalledWith("+919876543210");
      expect(otpService.storeOtp).toHaveBeenCalledWith("+919876543210", "123456");
      expect(smsService.sendOtpSms).toHaveBeenCalledWith("+919876543210", "123456");
      expect(result).toEqual({ otp_sent: true, expires_in_seconds: 300 });
    });
  });

  describe("verifyOtp", () => {
    it("issues tokens and allow-lists the refresh token jti", async () => {
      (userRepository.findOrCreateUserByPhone as jest.Mock).mockResolvedValue({ user: sampleUser, isNewUser: true });

      const result = await verifyOtp("+919876543210", "123456");

      expect(otpService.verifyAndConsumeOtp).toHaveBeenCalledWith("+919876543210", "123456");
      expect(mockedRedis.set).toHaveBeenCalledWith("refresh:jti-123", sampleUser.id, { EX: 604800 });
      expect(result).toEqual({
        access_token: "access.token",
        refresh_token: "refresh.token",
        expires_in_seconds: 900,
        user: sampleUser,
      });
    });
  });

  describe("refreshAccessToken", () => {
    it("issues a new access token when the refresh jti is allow-listed", async () => {
      (jwtService.verifyRefreshToken as jest.Mock).mockReturnValue({
        sub: sampleUser.id,
        type: "refresh",
        jti: "jti-123",
      });
      mockedRedis.get.mockResolvedValue(sampleUser.id);

      const result = await refreshAccessToken("refresh.token");
      expect(result).toEqual({ access_token: "access.token", expires_in_seconds: 900 });
    });

    it("throws UNAUTHENTICATED when the jti is not allow-listed (revoked/expired)", async () => {
      (jwtService.verifyRefreshToken as jest.Mock).mockReturnValue({
        sub: sampleUser.id,
        type: "refresh",
        jti: "jti-123",
      });
      mockedRedis.get.mockResolvedValue(null);

      await expect(refreshAccessToken("refresh.token")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    });
  });
});
