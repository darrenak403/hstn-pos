import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import { LoginRequestSchema, RefreshRequestSchema, type LoginRequest, type RefreshRequest } from "@seafood-pos/schemas";
import { z } from "zod";
import { AuthService } from "./auth.service";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";

const LogoutRequestSchema = z
  .object({ deviceId: z.string().min(1) })
  .strict();

const RevokeDeviceRequestSchema = z
  .object({ userId: z.string().uuid(), deviceId: z.string().min(1) })
  .strict();

@Controller("api/v1/auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: CurrentUserPayload) {
    return { data: await this.auth.me(user.id), message: { code: "CURRENT_USER", text: "Tài khoản hiện tại" } };
  }

  @Post("login")
  @UseGuards(ThrottlerGuard)
  // Tối đa 5 lần thử/phút theo IP — chặn brute-force mật khẩu mà không ảnh
  // hưởng người dùng gõ sai 1-2 lần (điều này sẽ xảy ra với người lớn tuổi).
  @Throttle({ login: { limit: 5, ttl: 60_000 } })
  async login(@Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest, @Req() req: Request) {
    const result = await this.auth.login(body, { ip: req.ip, userAgent: req.get("user-agent") ?? undefined });
    return { data: result, message: { code: "LOGIN_OK", text: "Đăng nhập thành công" } };
  }

  @Post("refresh")
  async refresh(@Body(new ZodValidationPipe(RefreshRequestSchema)) body: RefreshRequest) {
    const result = await this.auth.refresh(body);
    return { data: result, message: { code: "REFRESH_OK", text: "Làm mới phiên thành công" } };
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  async logout(
    @Body(new ZodValidationPipe(LogoutRequestSchema)) body: { deviceId: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    await this.auth.logout(user.id, body.deviceId);
    return { data: null, message: { code: "LOGOUT_OK", text: "Đã đăng xuất" } };
  }

  @Post("revoke-device")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  async revokeDevice(
    @Body(new ZodValidationPipe(RevokeDeviceRequestSchema)) body: { userId: string; deviceId: string },
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    await this.auth.revokeDevice(body.userId, body.deviceId, actor.id);
    return { data: null, message: { code: "DEVICE_REVOKED", text: "Đã thu hồi thiết bị" } };
  }
}
