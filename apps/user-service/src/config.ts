import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  return raw ? parseInt(raw, 10) : fallback;
}

export const config = {
  port: optionalInt("PORT", 3001),
  nodeEnv: process.env.NODE_ENV ?? "development",

  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),

  jwt: {
    // Support literal "\n" in env files (12-factor convention for PEM values)
    privateKey: required("JWT_PRIVATE_KEY").replace(/\\n/g, "\n"),
    publicKey: required("JWT_PUBLIC_KEY").replace(/\\n/g, "\n"),
    accessTokenExpirySeconds: optionalInt("JWT_ACCESS_TOKEN_EXPIRY_SECONDS", 900),
    refreshTokenExpirySeconds: optionalInt("JWT_REFRESH_TOKEN_EXPIRY_SECONDS", 604800),
  },

  otp: {
    ttlSeconds: optionalInt("OTP_TTL_SECONDS", 300),
    rateLimitMaxRequests: optionalInt("OTP_RATE_LIMIT_MAX_REQUESTS", 5),
    rateLimitWindowSeconds: optionalInt("OTP_RATE_LIMIT_WINDOW_SECONDS", 900),
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
    fromNumber: process.env.TWILIO_FROM_NUMBER ?? "",
  },

  internalServiceToken: required("INTERNAL_SERVICE_TOKEN"),
};
