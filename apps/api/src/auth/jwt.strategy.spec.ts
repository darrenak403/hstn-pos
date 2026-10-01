import { UnauthorizedException } from "@nestjs/common";
import { JwtStrategy } from "./jwt.strategy";
import type { AuthConfig } from "./auth.config";

function buildPrisma(user: { id: string; username: string; role: string; isActive: boolean } | null) {
  return { user: { findUnique: jest.fn(async () => user) } };
}

function buildConfig(): AuthConfig {
  return {
    accessTokenSecret: "secret",
    accessTokenTtlSeconds: 28800,
    refreshPepper: "pepper",
    refreshTokenTtlDays: 30,
    refreshGraceSeconds: 30,
    reuseDetectionMode: "log",
    graceEncryptionKey: Buffer.alloc(32),
  };
}

describe("JwtStrategy.validate", () => {
  const claims = { sub: "user-1", username: "admin", role: "ADMIN" as const };

  it("trả về payload khi user tồn tại và đang active", async () => {
    const prisma = buildPrisma({ id: "user-1", username: "admin", role: "ADMIN", isActive: true });
    const strategy = new JwtStrategy(buildConfig(), prisma as never);

    const result = await strategy.validate(claims);

    expect(result).toEqual({ id: "user-1", username: "admin", role: "ADMIN" });
  });

  it("từ chối khi user đã bị khoá (isActive=false) dù access token còn hạn", async () => {
    const prisma = buildPrisma({ id: "user-1", username: "admin", role: "ADMIN", isActive: false });
    const strategy = new JwtStrategy(buildConfig(), prisma as never);

    await expect(strategy.validate(claims)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("từ chối khi user đã bị xoá khỏi DB", async () => {
    const prisma = buildPrisma(null);
    const strategy = new JwtStrategy(buildConfig(), prisma as never);

    await expect(strategy.validate(claims)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
