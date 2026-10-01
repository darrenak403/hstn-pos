import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AUTH_CONFIG, type AuthConfig } from "./auth.config";
import { generateRefreshTokenPlaintext, hashRefreshToken } from "./token-hash";
import { GraceEncryptionService } from "./grace-encryption";

/**
 * Xoay refresh token an toàn khi có nhiều request đồng thời.
 *
 * LỊCH SỬ REVIEW (đừng lặp lại hai lỗi đã bị bác):
 *
 *   v4 hứa "trong cửa sổ ân hạn, trả lại ĐÚNG token kế nhiệm T'" nhưng
 *   RefreshToken chỉ lưu HASH — hash không thể dùng để tái tạo lại giá trị
 *   plaintext gốc. Review chỉ thẳng: không có dữ liệu để "phát lại" như đã hứa.
 *   => Sửa: thêm bảng RefreshTokenGrace lưu CHÍNH XÁC cặp token mới (plaintext)
 *      trong một cửa sổ ngắn (mặc định 30s), khoá bằng hash của token CŨ.
 *
 *   v4 cũng chưa khoá dòng/giao dịch khi xoay token, nên 2 request đến đồng
 *   thời có thể cùng thấy token "chưa xoay" và cùng phát sinh token kế nhiệm.
 *   => Sửa: dùng UPDATE ... WHERE "consumedAt" IS NULL ... RETURNING * làm phép
 *      compare-and-swap nguyên tử trong MỘT transaction Prisma duy nhất bao
 *      trùm luôn việc tạo token mới + ghi RefreshTokenGrace — không tách thành
 *      hai transaction riêng (tránh để lại trạng thái treo nếu transaction sau
 *      thất bại trong khi token cũ đã bị tiêu thụ ở transaction trước).
 *
 * Khoá tra cứu cho cả CAS lẫn bảng ân hạn đều là `tokenHash` (dữ liệu xác định
 * từ chính request, không phải ID do client tự sinh) + `deviceId` — không có
 * chỗ nào phụ thuộc vào việc client có gửi lại đúng một header tự chọn hay không
 * (đây là lỗ hổng của lớp "X-Refresh-Request-Id" ở bản kế hoạch trước, đã bỏ).
 */

type RevokeReason = "DEVICE_MISMATCH" | "REUSE_DETECTED" | "USER_INACTIVE";

export type RotateOutcome =
  | { kind: "ROTATED"; accessToken: string; refreshToken: string }
  | { kind: "REPLAYED_IN_GRACE"; accessToken: string; refreshToken: string }
  | { kind: "REVOKED_BY_ADMIN" }
  | { kind: "USER_INACTIVE" }
  | { kind: "REUSE_DETECTED"; securityEvent: "REFRESH_TOKEN_REUSE_DETECTED" | "REFRESH_DEVICE_MISMATCH"; userId: string }
  | { kind: "INVALID" };

export interface AuthUserForToken {
  id: string;
  username: string;
  role: string;
}

interface RefreshTokenRow {
  id: string;
  userId: string;
  deviceId: string;
  deviceLabel: string | null;
  familyId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  rotatedToTokenId: string | null;
  revokedAt: Date | null;
  revokedReason: string | null;
}

const DAY_MILLIS = 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshTokenRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly graceCrypto: GraceEncryptionService,
  ) {}

  /** Đăng nhập thành công — mở một family token mới cho thiết bị này. */
  async issueInitial(
    user: AuthUserForToken,
    deviceId: string,
    deviceLabel: string | undefined,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const familyId = randomUUID();
    const plaintext = generateRefreshTokenPlaintext();
    const tokenHash = hashRefreshToken(this.config.refreshPepper, plaintext);
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * DAY_MILLIS);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, deviceId, deviceLabel: deviceLabel ?? null, familyId, tokenHash, expiresAt },
    });

    return { accessToken: await this.signAccessTokenFor(user), refreshToken: plaintext };
  }

  /**
   * Xoay token. MỘT transaction duy nhất: compare-and-swap + mint token kế
   * nhiệm + ghi bản ghi ân hạn, hoặc tất cả cùng rollback nếu có lỗi — không có
   * trạng thái lửng giữa chừng.
   */
  async rotate(presentedToken: string, deviceId: string): Promise<RotateOutcome> {
    const oldHash = hashRefreshToken(this.config.refreshPepper, presentedToken);

    return this.prisma.$transaction(async (tx) => {
      const claimedRows = await tx.$queryRaw<RefreshTokenRow[]>`
        UPDATE "RefreshToken"
        SET "consumedAt" = now()
        WHERE "tokenHash" = ${oldHash}
          AND "consumedAt" IS NULL
          AND "revokedAt" IS NULL
          AND "expiresAt" > now()
        RETURNING *;
      `;

      const won = claimedRows[0];
      if (won != null) {
        if (won.deviceId !== deviceId) {
          // Đã tiêu thụ (không thể hoàn tác) nhưng thiết bị trình lên không khớp
          // thiết bị đã đăng ký — nghi vấn token bị đánh cắp sang máy khác. Thu
          // hồi family NGAY (không chờ bake-in "log"), vì đây là tín hiệu mạnh
          // hơn nhiều so với một cuộc đua bình thường giữa các tab/request của
          // cùng một máy.
          await this.revokeFamilyTx(tx, won.familyId, "DEVICE_MISMATCH", "enforce");
          return {
            kind: "REUSE_DETECTED",
            securityEvent: "REFRESH_DEVICE_MISMATCH",
            userId: won.userId,
          } satisfies RotateOutcome;
        }

        // Tra lại trạng thái user NGAY TẠI ĐÂY (không tin claim JWT cũ nào) —
        // nếu tài khoản đã bị khoá giữa chừng, không được phát hành token kế
        // nhiệm. Token cũ đã bị CAS tiêu thụ ở trên (không thể hoàn tác trong
        // cùng điều kiện WHERE nguyên tử), nên thu hồi nốt cả family để không
        // còn refresh token nào của phiên này còn dùng được.
        const user = await tx.user.findUnique({ where: { id: won.userId } });
        if (user == null || !user.isActive) {
          await this.revokeFamilyTx(tx, won.familyId, "USER_INACTIVE", "enforce");
          return { kind: "USER_INACTIVE" } satisfies RotateOutcome;
        }

        const minted = await this.mintSuccessorTx(tx, won, user);
        const graceCiphertext = this.graceCrypto.encryptPair(minted.accessToken, minted.refreshTokenPlaintext);
        await tx.refreshTokenGrace.create({
          data: {
            oldTokenHash: oldHash,
            userId: won.userId,
            deviceId,
            newAccessToken: graceCiphertext.accessTokenCiphertext,
            newRefreshToken: graceCiphertext.refreshTokenCiphertext,
            newRefreshTokenId: minted.id,
            expiresAt: new Date(Date.now() + this.config.refreshGraceSeconds * 1000),
          },
        });

        return {
          kind: "ROTATED",
          accessToken: minted.accessToken,
          refreshToken: minted.refreshTokenPlaintext,
        } satisfies RotateOutcome;
      }

      // CAS thất bại — token không tồn tại / đã bị tiêu thụ trước đó / hết hạn / đã bị thu hồi.
      const existing = await tx.refreshToken.findUnique({ where: { tokenHash: oldHash } });
      if (existing == null) return { kind: "INVALID" } satisfies RotateOutcome;

      if (existing.revokedReason === "ADMIN_REVOKED") {
        // Admin chủ động thu hồi thiết bị KHÔNG được coi là tấn công — không
        // được sinh cảnh báo an ninh giả mỗi lần Admin bấm nút này.
        return { kind: "REVOKED_BY_ADMIN" } satisfies RotateOutcome;
      }
      if (existing.revokedReason === "USER_INACTIVE") return { kind: "USER_INACTIVE" } satisfies RotateOutcome;
      if (existing.revokedReason === "LOGOUT" || existing.revokedReason === "EXPIRED_CLEANUP") {
        return { kind: "INVALID" } satisfies RotateOutcome;
      }

      if (existing.consumedAt == null) {
        // Hết hạn hoặc bị thu hồi vì lý do khác (LOGOUT/EXPIRED_CLEANUP) — lỗi
        // bình thường, không phải tấn công.
        return { kind: "INVALID" } satisfies RotateOutcome;
      }

      const user = await tx.user.findUnique({ where: { id: existing.userId }, select: { isActive: true } });
      if (user == null || !user.isActive) {
        await this.revokeFamilyTx(tx, existing.familyId, "USER_INACTIVE", "enforce");
        return { kind: "USER_INACTIVE" } satisfies RotateOutcome;
      }

      // Đã bị tiêu thụ trước đó — đến từ 1 trong 2 tình huống lành tính:
      //   (a) request này thua cuộc đua CAS với 1 request khác vừa xảy ra;
      //   (b) request này là retry do mất phản hồi mạng của chính lần xoay trước.
      // Cả hai đều được giải quyết bằng cách tra lại CHÍNH XÁC cặp token đã
      // phát ra, không mint thêm token mới.
      const grace = await tx.refreshTokenGrace.findUnique({ where: { oldTokenHash: oldHash } });
      if (grace != null && grace.expiresAt > new Date() && grace.deviceId === deviceId) {
        const successor = await tx.refreshToken.findUnique({
          where: { id: grace.newRefreshTokenId },
          select: { consumedAt: true, expiresAt: true, revokedAt: true, revokedReason: true },
        });
        if (successor?.revokedReason === "ADMIN_REVOKED") return { kind: "REVOKED_BY_ADMIN" } satisfies RotateOutcome;
        if (successor?.revokedReason === "USER_INACTIVE") return { kind: "USER_INACTIVE" } satisfies RotateOutcome;
        if (successor?.revokedReason === "LOGOUT" || successor?.revokedReason === "EXPIRED_CLEANUP") {
          return { kind: "INVALID" } satisfies RotateOutcome;
        }
        if (successor == null || successor.expiresAt <= new Date()) {
          return { kind: "INVALID" } satisfies RotateOutcome;
        }
        if (successor.revokedAt != null || successor.consumedAt != null) {
          await this.revokeFamilyTx(tx, existing.familyId, "REUSE_DETECTED", this.config.reuseDetectionMode);
          return {
            kind: "REUSE_DETECTED",
            securityEvent: "REFRESH_TOKEN_REUSE_DETECTED",
            userId: existing.userId,
          } satisfies RotateOutcome;
        }
        const pair = this.graceCrypto.decryptPair(grace.newAccessToken, grace.newRefreshToken);
        return {
          kind: "REPLAYED_IN_GRACE",
          accessToken: pair.accessToken,
          refreshToken: pair.refreshToken,
        } satisfies RotateOutcome;
      }

      // Ân hạn đã hết (hoặc record đã bị dọn) mà vẫn có người trình lại token cũ
      // — đây mới là tái sử dụng thật.
      await this.revokeFamilyTx(tx, existing.familyId, "REUSE_DETECTED", this.config.reuseDetectionMode);
      return {
        kind: "REUSE_DETECTED",
        securityEvent: "REFRESH_TOKEN_REUSE_DETECTED",
        userId: existing.userId,
      } satisfies RotateOutcome;
    });
  }

  /** Admin bấm "Thu hồi thiết bị" — không đụng tới các thiết bị khác của user. */
  async revokeAllForDevice(userId: string, deviceId: string, reason: "ADMIN_REVOKED" | "LOGOUT" = "ADMIN_REVOKED"): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, deviceId },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Dọn các bản ghi ân hạn đã hết hạn — gọi định kỳ, xem refresh-token-cleanup.service.ts. */
  async cleanupExpiredGraceRecords(): Promise<number> {
    const result = await this.prisma.refreshTokenGrace.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  private async mintSuccessorTx(
    tx: Prisma.TransactionClient,
    oldRow: RefreshTokenRow,
    user: AuthUserForToken,
  ): Promise<{ id: string; accessToken: string; refreshTokenPlaintext: string }> {
    const plaintext = generateRefreshTokenPlaintext();
    const tokenHash = hashRefreshToken(this.config.refreshPepper, plaintext);
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * DAY_MILLIS);

    const newRow = await tx.refreshToken.create({
      data: {
        userId: oldRow.userId,
        deviceId: oldRow.deviceId,
        deviceLabel: oldRow.deviceLabel,
        familyId: oldRow.familyId,
        tokenHash,
        expiresAt,
      },
    });

    await tx.refreshToken.update({
      where: { id: oldRow.id },
      data: { rotatedToTokenId: newRow.id, revokedAt: new Date(), revokedReason: "ROTATED" },
    });

    return {
      id: newRow.id,
      accessToken: await this.signAccessTokenFor(user),
      refreshTokenPlaintext: plaintext,
    };
  }

  /**
   * mode="log": chỉ ghi nhận ở tầng gọi (auth.service ghi AuditLog), KHÔNG thu
   * hồi các phiên khác — tránh đá người dùng ra giữa lúc tính tiền vì một dương
   * tính giả trong giai đoạn bake-in (xem docs/adr/0003-refresh-token-rotation.md).
   * DEVICE_MISMATCH luôn dùng mode="enforce" bất kể cấu hình toàn cục (gọi tường
   * minh từ rotate()), vì tín hiệu mạnh hơn hẳn so với REUSE_DETECTED thường.
   */
  private async revokeFamilyTx(
    tx: Prisma.TransactionClient,
    familyId: string,
    reason: RevokeReason,
    mode: "log" | "enforce",
  ): Promise<void> {
    if (mode === "log") return;

    await tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async signAccessTokenFor(user: AuthUserForToken): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, username: user.username, role: user.role },
      { secret: this.config.accessTokenSecret, expiresIn: this.config.accessTokenTtlSeconds },
    );
  }
}
