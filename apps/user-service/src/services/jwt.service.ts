import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config";
import { AppError } from "../types/errors";

export type TokenType = "access" | "refresh";

export interface AccessTokenPayload {
  sub: string; // user id
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string; // user id
  type: "refresh";
  jti: string; // unique token id, used for Redis allow-list / revocation
}

export function signAccessToken(userId: string): { token: string; expiresInSeconds: number } {
  const expiresInSeconds = config.jwt.accessTokenExpirySeconds;
  const token = jwt.sign({ sub: userId, type: "access" } as AccessTokenPayload, config.jwt.privateKey, {
    algorithm: "RS256",
    expiresIn: expiresInSeconds,
  });
  return { token, expiresInSeconds };
}

export function signRefreshToken(userId: string): { token: string; jti: string; expiresInSeconds: number } {
  const expiresInSeconds = config.jwt.refreshTokenExpirySeconds;
  const jti = uuidv4();
  const token = jwt.sign({ sub: userId, type: "refresh", jti } as RefreshTokenPayload, config.jwt.privateKey, {
    algorithm: "RS256",
    expiresIn: expiresInSeconds,
  });
  return { token, jti, expiresInSeconds };
}

function verify<T>(token: string): T {
  try {
    return jwt.verify(token, config.jwt.publicKey, { algorithms: ["RS256"] }) as T;
  } catch {
    throw new AppError("UNAUTHENTICATED", "Invalid or expired token");
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = verify<AccessTokenPayload>(token);
  if (payload.type !== "access") {
    throw new AppError("UNAUTHENTICATED", "Token is not an access token");
  }
  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = verify<RefreshTokenPayload>(token);
  if (payload.type !== "refresh") {
    throw new AppError("UNAUTHENTICATED", "Token is not a refresh token");
  }
  return payload;
}
