import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { LoginRequest, RefreshRequest } from "@seafood-pos/schemas";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PasswordService } from "./password.service";
import { RefreshTokenRepository } from "./refresh-token.repository";

export interface RequestContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends TokenPair {
  user: { id: string; username: string; displayName: string; role: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly auditLog: AuditLogService,
  ) {}

  async login(input: LoginRequest, context: RequestContext): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { username: input.username } });

    if (user == null || !user.isActive) {
      await this.auditLog.log({
        category: "SECURITY",
        action: "LOGIN_FAILED",
        success: false,
        actorUsernameAttempted: input.username,
        deviceId: input.deviceId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedException("Sai tên đăng nhập hoặc mật khẩu");
    }

    const passwordOk = await this.passwords.verify(input.password, user.passwordHash);
    if (!passwordOk) {
      await this.auditLog.log({
        category: "SECURITY",
        action: "LOGIN_FAILED",
        success: false,
        actorId: user.id,
        actorUsernameAttempted: input.username,
        deviceId: input.deviceId,
        ip: context.ip,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedException("Sai tên đăng nhập hoặc mật khẩu");
    }

    const tokens = await this.refreshTokens.issueInitial(user, input.deviceId, input.deviceLabel);

    await this.auditLog.log({
      category: "SECURITY",
      action: "LOGIN_SUCCEEDED",
      actorId: user.id,
      deviceId: input.deviceId,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      ...tokens,
      user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role },
    };
  }

  async refresh(input: RefreshRequest): Promise<TokenPair> {
    const outcome = await this.refreshTokens.rotate(input.refreshToken, input.deviceId);

    switch (outcome.kind) {
      case "ROTATED":
      case "REPLAYED_IN_GRACE":
        return { accessToken: outcome.accessToken, refreshToken: outcome.refreshToken };

      case "REVOKED_BY_ADMIN":
        throw new UnauthorizedException("Thiết bị này đã bị quản lý thu hồi quyền truy cập");

      case "USER_INACTIVE":
        throw new UnauthorizedException("Tài khoản đã bị khoá, vui lòng liên hệ quản lý");

      case "REUSE_DETECTED":
        await this.auditLog.log({
          category: "SECURITY",
          action: outcome.securityEvent,
          success: false,
          actorId: outcome.userId,
          deviceId: input.deviceId,
        });
        throw new UnauthorizedException("Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại");

      case "INVALID":
        throw new UnauthorizedException("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");

      default: {
        const exhaustiveCheck: never = outcome;
        throw new Error(`Trạng thái refresh không xác định: ${JSON.stringify(exhaustiveCheck)}`);
      }
    }
  }

  async me(userId: string): Promise<{ id: string; username: string; displayName: string; role: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, displayName: true, role: true, isActive: true },
    });
    if (!user?.isActive) throw new UnauthorizedException("Tài khoản đã bị khoá hoặc không tồn tại");
    return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
  }

  async logout(userId: string, deviceId: string): Promise<void> {
    await this.refreshTokens.revokeAllForDevice(userId, deviceId, "LOGOUT");
    await this.auditLog.log({
      category: "SECURITY",
      action: "LOGOUT",
      actorId: userId,
      deviceId,
    });
  }

  async revokeDevice(userId: string, deviceId: string, actorId: string): Promise<void> {
    await this.refreshTokens.revokeAllForDevice(userId, deviceId, "ADMIN_REVOKED");
    await this.auditLog.log({
      category: "SECURITY",
      action: "DEVICE_REVOKED_BY_ADMIN",
      actorId,
      entityType: "User",
      entityId: userId,
      deviceId,
    });
  }
}
