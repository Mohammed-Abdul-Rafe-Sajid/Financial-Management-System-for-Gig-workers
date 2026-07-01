jest.mock("../src/services/redis.client", () => ({
  redisClient: {
    incr: jest.fn(),
    expire: jest.fn(),
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock("../src/config", () => ({
  config: {
    otp: { ttlSeconds: 300, rateLimitMaxRequests: 5, rateLimitWindowSeconds: 900 },
  },
}));

import { redisClient } from "../src/services/redis.client";
import { generateOtp, enforceRateLimit, storeOtp, verifyAndConsumeOtp } from "../src/services/otp.service";
import { AppError } from "../src/types/errors";

const mockedRedis = redisClient as unknown as {
  incr: jest.Mock;
  expire: jest.Mock;
  set: jest.Mock;
  get: jest.Mock;
  del: jest.Mock;
};

describe("otp.service", () => {
  describe("generateOtp", () => {
    it("produces a 6-digit numeric string", () => {
      for (let i = 0; i < 20; i++) {
        const otp = generateOtp();
        expect(otp).toMatch(/^\d{6}$/);
      }
    });
  });

  describe("enforceRateLimit", () => {
    it("sets expiry on the first request in a window", async () => {
      mockedRedis.incr.mockResolvedValue(1);
      await enforceRateLimit("+919876543210");
      expect(mockedRedis.expire).toHaveBeenCalledWith("otp:ratelimit:+919876543210", 900);
    });

    it("does not re-set expiry on subsequent requests", async () => {
      mockedRedis.incr.mockResolvedValue(2);
      await enforceRateLimit("+919876543210");
      expect(mockedRedis.expire).not.toHaveBeenCalled();
    });

    it("throws RATE_LIMITED after the max is exceeded", async () => {
      mockedRedis.incr.mockResolvedValue(6);
      await expect(enforceRateLimit("+919876543210")).rejects.toThrow(AppError);
      await expect(enforceRateLimit("+919876543210")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    });
  });

  describe("storeOtp", () => {
    it("stores the OTP with the configured TTL", async () => {
      await storeOtp("+919876543210", "123456");
      expect(mockedRedis.set).toHaveBeenCalledWith("otp:+919876543210", "123456", { EX: 300 });
    });
  });

  describe("verifyAndConsumeOtp", () => {
    it("throws OTP_EXPIRED when nothing is stored", async () => {
      mockedRedis.get.mockResolvedValue(null);
      await expect(verifyAndConsumeOtp("+919876543210", "123456")).rejects.toMatchObject({ code: "OTP_EXPIRED" });
    });

    it("throws OTP_INVALID on mismatch", async () => {
      mockedRedis.get.mockResolvedValue("999999");
      await expect(verifyAndConsumeOtp("+919876543210", "123456")).rejects.toMatchObject({ code: "OTP_INVALID" });
    });

    it("deletes the OTP on successful match", async () => {
      mockedRedis.get.mockResolvedValue("123456");
      await verifyAndConsumeOtp("+919876543210", "123456");
      expect(mockedRedis.del).toHaveBeenCalledWith("otp:+919876543210");
    });
  });
});
