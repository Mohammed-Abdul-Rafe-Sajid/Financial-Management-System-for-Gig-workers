import { generateKeyPairSync } from "crypto";

const mockKeyPair = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

jest.mock("../src/config", () => ({
  config: {
    jwt: {
      privateKey: mockKeyPair.privateKey,
      publicKey: mockKeyPair.publicKey,
      accessTokenExpirySeconds: 900,
      refreshTokenExpirySeconds: 604800,
    },
  },
}));

import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from "../src/services/jwt.service";
import { AppError } from "../src/types/errors";

describe("jwt.service", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  it("signs and verifies an access token", () => {
    const { token, expiresInSeconds } = signAccessToken(userId);
    expect(expiresInSeconds).toBe(900);
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe(userId);
    expect(payload.type).toBe("access");
  });

  it("signs and verifies a refresh token with a unique jti", () => {
    const first = signRefreshToken(userId);
    const second = signRefreshToken(userId);
    expect(first.jti).not.toBe(second.jti);

    const payload = verifyRefreshToken(first.token);
    expect(payload.sub).toBe(userId);
    expect(payload.type).toBe("refresh");
    expect(payload.jti).toBe(first.jti);
  });

  it("rejects a refresh token passed to verifyAccessToken", () => {
    const { token } = signRefreshToken(userId);
    expect(() => verifyAccessToken(token)).toThrow(AppError);
  });

  it("rejects a garbage token", () => {
    expect(() => verifyAccessToken("not-a-real-token")).toThrow(AppError);
  });
});
