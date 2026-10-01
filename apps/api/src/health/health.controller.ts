import { Controller, Get, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Endpoint công khai (không qua JwtAuthGuard) — Docker healthcheck và Uptime
 * Kuma gọi trực tiếp, phải luôn trả lời được kể cả khi chưa đăng nhập.
 *
 * TODO (ngoài phạm vi lượt code này, xem kế hoạch §5/§9): bổ sung
 * lastLocalBackupAt / lastOffsiteBackupAt / lastRestoreVerifyAt / tlsCertExpiresAt
 * sau khi scripts/backup-*.sh và provision-pos-machine.ps1 được triển khai —
 * không bịa giá trị giả ở đây.
 */
@Controller("health")
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let databaseOk = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      databaseOk = false;
      this.logger.warn("Health check không kết nối được PostgreSQL", error instanceof Error ? error.stack : String(error));
    }

    return {
      data: {
        status: databaseOk ? "ok" : "degraded",
        database: databaseOk ? "connected" : "unreachable",
      },
      message: { code: "HEALTH_OK", text: "OK" },
    };
  }
}
