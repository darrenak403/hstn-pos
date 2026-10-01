import { RefreshTokenRepository } from "./refresh-token.repository";
import { hashRefreshToken } from "./token-hash";
import type { AuthConfig } from "./auth.config";

/**
 * Bài test này tái hiện chính xác 2 lỗ hổng mà review đã bác hai lần liên tiếp:
 *   1. "trả lại đúng token kế nhiệm T' trong cửa sổ ân hạn" khi hệ thống chỉ lưu
 *      hash — xem test "REPLAYED_IN_GRACE trả đúng cặp token đã phát trước đó".
 *   2. "hai request đồng thời cùng thấy token chưa xoay" — xem test
 *      "CAS trả 0 dòng cho request thua cuộc, không mint token mới".
 */

const PEPPER = "test-pepper";
const DEVICE_ID = "device-aaa";

function buildConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    accessTokenSecret: "secret",
    accessTokenTtlSeconds: 28800,
    refreshPepper: PEPPER,
    refreshTokenTtlDays: 30,
    refreshGraceSeconds: 30,
    reuseDetectionMode: "log",
    graceEncryptionKey: Buffer.alloc(32),
    ...overrides,
  };
}

function buildTx() {
  return {
    $queryRaw: jest.fn(),
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    refreshTokenGrace: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
}

function buildPrisma(tx: ReturnType<typeof buildTx>) {
  return {
    $transaction: jest.fn(async (fn: (tx: ReturnType<typeof buildTx>) => Promise<unknown>) => fn(tx)),
  };
}

function buildJwt() {
  return { signAsync: jest.fn(async (payload: { sub: string }) => `access-token-for-${payload.sub}`) };
}

function activeSuccessor() {
  return { consumedAt: null, expiresAt: new Date(Date.now() + 1000 * 60 * 60), revokedAt: null, revokedReason: null };
}

// Fake đơn giản nhưng vẫn chứng minh repository THỰC SỰ gọi mã hoá/giải mã
// (không chỉ truyền thẳng plaintext) — bọc giá trị trong "enc(...)" để phát
// hiện nếu code quên gọi encryptPair trước khi ghi DB.
function buildGraceCrypto() {
  return {
    encryptPair: jest.fn((accessToken: string, refreshToken: string) => ({
      accessTokenCiphertext: `enc(${accessToken})`,
      refreshTokenCiphertext: `enc(${refreshToken})`,
    })),
    decryptPair: jest.fn((accessTokenCiphertext: string, refreshTokenCiphertext: string) => ({
      accessToken: accessTokenCiphertext.replace(/^enc\(|\)$/g, ""),
      refreshToken: refreshTokenCiphertext.replace(/^enc\(|\)$/g, ""),
    })),
  };
}

describe("RefreshTokenRepository.rotate", () => {
  const OLD_PLAINTEXT = "old-refresh-token-plaintext";
  const OLD_HASH = hashRefreshToken(PEPPER, OLD_PLAINTEXT);

  function baseRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "token-1",
      userId: "user-1",
      deviceId: DEVICE_ID,
      deviceLabel: null,
      familyId: "family-1",
      tokenHash: OLD_HASH,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      consumedAt: null,
      rotatedToTokenId: null,
      revokedAt: null,
      revokedReason: null,
      ...overrides,
    };
  }

  it("CAS thắng cuộc đua -> ROTATED, mint đúng 1 token mới + 1 bản ghi ân hạn", async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const jwt = buildJwt();
    const graceCrypto = buildGraceCrypto();
    const repo = new RefreshTokenRepository(prisma as never, jwt as never, buildConfig(), graceCrypto as never);

    tx.$queryRaw.mockResolvedValueOnce([baseRow({ consumedAt: new Date() })]);
    tx.user.findUnique.mockResolvedValueOnce({ id: "user-1", username: "admin", role: "ADMIN", isActive: true });
    tx.refreshToken.create.mockResolvedValueOnce({ id: "token-2" });

    const outcome = await repo.rotate(OLD_PLAINTEXT, DEVICE_ID);

    expect(outcome.kind).toBe("ROTATED");
    expect(tx.refreshToken.create).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ revokedReason: "ROTATED" }) }),
    );
    expect(tx.refreshTokenGrace.create).toHaveBeenCalledTimes(1);
    const graceArg = tx.refreshTokenGrace.create.mock.calls[0]?.[0];
    expect(graceArg.data.oldTokenHash).toBe(OLD_HASH);
    expect(graceArg.data.deviceId).toBe(DEVICE_ID);
    // Phải lưu CIPHERTEXT (đi qua graceCrypto.encryptPair), không phải plaintext thẳng.
    expect(graceCrypto.encryptPair).toHaveBeenCalledTimes(1);
    expect(graceArg.data.newAccessToken).toBe("enc(access-token-for-user-1)");
    expect(graceArg.data.newRefreshToken).toMatch(/^enc\(.+\)$/);
  });

  it("tài khoản đã bị khoá giữa chừng -> USER_INACTIVE, thu hồi family, không mint token mới", async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const jwt = buildJwt();
    const graceCrypto = buildGraceCrypto();
    const repo = new RefreshTokenRepository(prisma as never, jwt as never, buildConfig(), graceCrypto as never);

    tx.$queryRaw.mockResolvedValueOnce([baseRow({ consumedAt: new Date() })]);
    tx.user.findUnique.mockResolvedValueOnce({ id: "user-1", username: "admin", role: "ADMIN", isActive: false });

    const outcome = await repo.rotate(OLD_PLAINTEXT, DEVICE_ID);

    expect(outcome).toEqual({ kind: "USER_INACTIVE" });
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
    expect(tx.refreshTokenGrace.create).not.toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: "family-1", revokedAt: null },
      data: expect.objectContaining({ revokedReason: "USER_INACTIVE" }),
    });
  });

  it("CAS trả 0 dòng cho request thua cuộc, không mint token mới, không ghi grace mới", async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const jwt = buildJwt();
    const graceCrypto = buildGraceCrypto();
    const repo = new RefreshTokenRepository(prisma as never, jwt as never, buildConfig(), graceCrypto as never);

    // Request này THUA cuộc đua CAS: $queryRaw trả mảng rỗng.
    tx.$queryRaw.mockResolvedValueOnce([]);
    tx.refreshToken.findUnique.mockResolvedValueOnce(
      baseRow({ consumedAt: new Date(), revokedReason: "ROTATED" }),
    ).mockResolvedValueOnce(activeSuccessor());
    tx.refreshTokenGrace.findUnique.mockResolvedValueOnce({
      oldTokenHash: OLD_HASH,
      userId: "user-1",
      deviceId: DEVICE_ID,
      newAccessToken: "enc(access-token-for-user-1)",
      newRefreshToken: "enc(winner-refresh-token)",
      newRefreshTokenId: "token-2",
      expiresAt: new Date(Date.now() + 20_000),
    });
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });

    const outcome = await repo.rotate(OLD_PLAINTEXT, DEVICE_ID);

    expect(outcome).toEqual({
      kind: "REPLAYED_IN_GRACE",
      accessToken: "access-token-for-user-1",
      refreshToken: "winner-refresh-token",
    });
    // Không được mint thêm token hay ghi thêm bản ghi ân hạn mới cho "kẻ thua cuộc".
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
    expect(tx.refreshTokenGrace.create).not.toHaveBeenCalled();
  });

  it('REPLAYED_IN_GRACE trả đúng cặp token đã phát trước đó (không "tái tạo" từ hash)', async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const jwt = buildJwt();
    const graceCrypto = buildGraceCrypto();
    const repo = new RefreshTokenRepository(prisma as never, jwt as never, buildConfig(), graceCrypto as never);

    tx.$queryRaw.mockResolvedValueOnce([]);
    tx.refreshToken.findUnique.mockResolvedValueOnce(
      baseRow({ consumedAt: new Date(), revokedReason: "ROTATED" }),
    ).mockResolvedValueOnce(activeSuccessor());
    tx.refreshTokenGrace.findUnique.mockResolvedValueOnce({
      oldTokenHash: OLD_HASH,
      userId: "user-1",
      deviceId: DEVICE_ID,
      newAccessToken: "enc(exact-access-token)",
      newRefreshToken: "enc(exact-refresh-token-plaintext)",
      newRefreshTokenId: "token-2",
      expiresAt: new Date(Date.now() + 20_000),
    });

    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });

    const outcome = await repo.rotate(OLD_PLAINTEXT, DEVICE_ID);

    expect(outcome.kind).toBe("REPLAYED_IN_GRACE");
    if (outcome.kind === "REPLAYED_IN_GRACE") {
      expect(outcome.accessToken).toBe("exact-access-token");
      expect(outcome.refreshToken).toBe("exact-refresh-token-plaintext");
    }
  });

  it("không phát lại token kế nhiệm sau khi đăng xuất", async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const jwt = buildJwt();
    const graceCrypto = buildGraceCrypto();
    const repo = new RefreshTokenRepository(prisma as never, jwt as never, buildConfig(), graceCrypto as never);

    tx.$queryRaw.mockResolvedValueOnce([]);
    tx.refreshToken.findUnique.mockResolvedValueOnce(
      baseRow({ consumedAt: new Date(), revokedReason: "ROTATED" }),
    ).mockResolvedValueOnce({
      ...activeSuccessor(),
      revokedAt: new Date(),
      revokedReason: "LOGOUT",
    });
    tx.refreshTokenGrace.findUnique.mockResolvedValueOnce({
      oldTokenHash: OLD_HASH,
      userId: "user-1",
      deviceId: DEVICE_ID,
      newAccessToken: "enc(access-token)",
      newRefreshToken: "enc(refresh-token)",
      newRefreshTokenId: "token-2",
      expiresAt: new Date(Date.now() + 20_000),
    });
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });

    const outcome = await repo.rotate(OLD_PLAINTEXT, DEVICE_ID);

    expect(outcome).toEqual({ kind: "INVALID" });
    expect(graceCrypto.decryptPair).not.toHaveBeenCalled();
  });

  it("ân hạn đã hết hạn -> REUSE_DETECTED thật, mode=enforce thu hồi cả family", async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const jwt = buildJwt();
    const graceCrypto = buildGraceCrypto();
    const repo = new RefreshTokenRepository(
      prisma as never,
      jwt as never,
      buildConfig({ reuseDetectionMode: "enforce" }),
      graceCrypto as never,
    );

    tx.$queryRaw.mockResolvedValueOnce([]);
    tx.refreshToken.findUnique.mockResolvedValueOnce(
      baseRow({ consumedAt: new Date(Date.now() - 60_000), revokedReason: "ROTATED" }),
    );
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.refreshTokenGrace.findUnique.mockResolvedValueOnce(null); // grace đã bị dọn / hết hạn

    const outcome = await repo.rotate(OLD_PLAINTEXT, DEVICE_ID);

    expect(outcome).toMatchObject({ kind: "REUSE_DETECTED", securityEvent: "REFRESH_TOKEN_REUSE_DETECTED" });
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: "family-1", revokedAt: null },
      data: expect.objectContaining({ revokedReason: "REUSE_DETECTED" }),
    });
  });

  it('mode="log" (bake-in): phát hiện tái sử dụng thật nhưng KHÔNG thu hồi gì', async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const jwt = buildJwt();
    const graceCrypto = buildGraceCrypto();
    const repo = new RefreshTokenRepository(
      prisma as never,
      jwt as never,
      buildConfig({ reuseDetectionMode: "log" }),
      graceCrypto as never,
    );

    tx.$queryRaw.mockResolvedValueOnce([]);
    tx.refreshToken.findUnique.mockResolvedValueOnce(
      baseRow({ consumedAt: new Date(Date.now() - 60_000), revokedReason: "ROTATED" }),
    );
    tx.user.findUnique.mockResolvedValueOnce({ isActive: true });
    tx.refreshTokenGrace.findUnique.mockResolvedValueOnce(null);

    const outcome = await repo.rotate(OLD_PLAINTEXT, DEVICE_ID);

    expect(outcome.kind).toBe("REUSE_DETECTED");
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it("thiết bị không khớp -> REUSE_DETECTED (REFRESH_DEVICE_MISMATCH), LUÔN thu hồi bất kể mode", async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const jwt = buildJwt();
    const graceCrypto = buildGraceCrypto();
    const repo = new RefreshTokenRepository(
      prisma as never,
      jwt as never,
      buildConfig({ reuseDetectionMode: "log" }),
      graceCrypto as never,
    );

    tx.$queryRaw.mockResolvedValueOnce([baseRow({ consumedAt: new Date(), deviceId: "device-khac" })]);

    const outcome = await repo.rotate(OLD_PLAINTEXT, DEVICE_ID);

    expect(outcome).toMatchObject({ kind: "REUSE_DETECTED", securityEvent: "REFRESH_DEVICE_MISMATCH" });
    // DEVICE_MISMATCH luôn enforce dù cấu hình toàn cục đang "log".
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: "family-1", revokedAt: null },
      data: expect.objectContaining({ revokedReason: "DEVICE_MISMATCH" }),
    });
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it("Admin đã thu hồi thiết bị -> REVOKED_BY_ADMIN, KHÔNG sinh cảnh báo an ninh giả", async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const jwt = buildJwt();
    const graceCrypto = buildGraceCrypto();
    const repo = new RefreshTokenRepository(prisma as never, jwt as never, buildConfig(), graceCrypto as never);

    tx.$queryRaw.mockResolvedValueOnce([]);
    tx.refreshToken.findUnique.mockResolvedValueOnce(
      baseRow({ consumedAt: null, revokedAt: new Date(), revokedReason: "ADMIN_REVOKED" }),
    );

    const outcome = await repo.rotate(OLD_PLAINTEXT, DEVICE_ID);

    expect(outcome).toEqual({ kind: "REVOKED_BY_ADMIN" });
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
    expect(tx.refreshTokenGrace.findUnique).not.toHaveBeenCalled();
  });

  it("token không tồn tại -> INVALID", async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const jwt = buildJwt();
    const graceCrypto = buildGraceCrypto();
    const repo = new RefreshTokenRepository(prisma as never, jwt as never, buildConfig(), graceCrypto as never);

    tx.$queryRaw.mockResolvedValueOnce([]);
    tx.refreshToken.findUnique.mockResolvedValueOnce(null);

    const outcome = await repo.rotate(OLD_PLAINTEXT, DEVICE_ID);
    expect(outcome).toEqual({ kind: "INVALID" });
  });

  it("token tồn tại nhưng chưa từng bị tiêu thụ (hết hạn thường) -> INVALID, không phải REUSE", async () => {
    const tx = buildTx();
    const prisma = buildPrisma(tx);
    const jwt = buildJwt();
    const graceCrypto = buildGraceCrypto();
    const repo = new RefreshTokenRepository(prisma as never, jwt as never, buildConfig(), graceCrypto as never);

    tx.$queryRaw.mockResolvedValueOnce([]);
    tx.refreshToken.findUnique.mockResolvedValueOnce(baseRow({ consumedAt: null, revokedReason: null }));

    const outcome = await repo.rotate(OLD_PLAINTEXT, DEVICE_ID);
    expect(outcome).toEqual({ kind: "INVALID" });
  });
});
