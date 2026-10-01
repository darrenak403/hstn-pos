import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AUTH_CONFIG, type AuthConfig } from "./auth.config";
import { PrismaService } from "../prisma/prisma.service";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";

interface AccessTokenClaims {
  sub: string;
  username: string;
  role: "ADMIN" | "SELLER";
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(AUTH_CONFIG) config: AuthConfig,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.accessTokenSecret,
    });
  }

  /**
   * Tra lại DB thay vì tin claim trong token: vô hiệu hoá user (isActive=false)
   * phải chặn được NGAY, kể cả khi access token hiện có còn hạn tới 8 tiếng
   * (JWT_ACCESS_TTL_SECONDS) — claim ký lúc đăng nhập không tự cập nhật khi
   * admin khoá tài khoản giữa chừng.
   */
  async validate(claims: AccessTokenClaims): Promise<CurrentUserPayload> {
    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (user == null || !user.isActive) {
      throw new UnauthorizedException("Tài khoản đã bị khoá hoặc không tồn tại");
    }
    return { id: user.id, username: user.username, role: user.role };
  }
}
