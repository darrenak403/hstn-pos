import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { RefreshTokenRepository } from "./refresh-token.repository";

/**
 * Dọn RefreshTokenGrace đã hết hạn (mặc định ~30s/bản ghi) — bảng này chỉ nên
 * chứa vài bản ghi "đang trong cửa sổ ân hạn" tại bất kỳ thời điểm nào, dọn mỗi
 * giờ là đủ (không cần tần suất cao, hết hạn chỉ khiến tra cứu grace trả về
 * "không tìm thấy", không gây lỗi chức năng).
 */
@Injectable()
export class RefreshTokenCleanupService {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(private readonly refreshTokens: RefreshTokenRepository) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup(): Promise<void> {
    const deleted = await this.refreshTokens.cleanupExpiredGraceRecords();
    if (deleted > 0) {
      this.logger.log(`Đã dọn ${deleted} bản ghi RefreshTokenGrace hết hạn`);
    }
  }
}
