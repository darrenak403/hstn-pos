import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { AUTH_CONFIG, loadAuthConfigFromEnv } from "./auth.config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GraceEncryptionService } from "./grace-encryption";
import { JwtStrategy } from "./jwt.strategy";
import { PasswordService } from "./password.service";
import { RefreshTokenCleanupService } from "./refresh-token-cleanup.service";
import { RefreshTokenRepository } from "./refresh-token.repository";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    AuditLogModule,
    // Giới hạn tần suất CHỈ áp dụng ở route login (gắn ThrottlerGuard tường
    // minh tại đó, xem auth.controller.ts) — không đăng ký APP_GUARD toàn cục,
    // tránh giới hạn nhầm các API nghiệp vụ khác (bán hàng, nhập kho) vốn cần
    // thông lượng cao hơn nhiều so với 5 lần/phút.
    ThrottlerModule.forRoot([{ name: "login", ttl: 60_000, limit: 5 }]),
  ],
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => loadAuthConfigFromEnv(process.env) },
    AuthService,
    PasswordService,
    GraceEncryptionService,
    RefreshTokenRepository,
    RefreshTokenCleanupService,
    JwtStrategy,
  ],
  exports: [AuthService, RefreshTokenRepository, PasswordService],
})
export class AuthModule {}
