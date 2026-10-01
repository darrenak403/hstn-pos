import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { PriceOverrideSettingSchema, type PriceOverrideSetting } from "@seafood-pos/schemas";
import { createBusinessAudit } from "../audit-log/audit-transaction";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";

const SETTING_KEY = "PRICE_OVERRIDE_MAX_DEVIATION_PERCENT";

@Controller("api/v1/settings")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class SettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("price-override-threshold")
  async getThreshold() {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: SETTING_KEY } });
    const value = setting?.value;
    return {
      data: { maxDeviationPercent: typeof value === "number" ? value : 20 },
      message: { code: "PRICE_OVERRIDE_THRESHOLD", text: "Giới hạn đổi giá" },
    };
  }

  @Put("price-override-threshold")
  async setThreshold(
    @Body(new ZodValidationPipe(PriceOverrideSettingSchema)) input: PriceOverrideSetting,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    const data = await this.prisma.$transaction(async (tx) => {
      const result = await tx.appSetting.upsert({
        where: { key: SETTING_KEY },
        create: { key: SETTING_KEY, value: input.maxDeviationPercent },
        update: { value: input.maxDeviationPercent },
      });
      await createBusinessAudit(tx, {
        actorId: actor.id,
        action: "PRICE_OVERRIDE_THRESHOLD_CHANGED",
        entityType: "AppSetting",
        entityId: SETTING_KEY,
        metadata: { maxDeviationPercent: input.maxDeviationPercent },
      });
      return result;
    });
    const value = data.value;
    if (typeof value !== "number") throw new Error("Giá trị ngưỡng đổi giá đã lưu không phải số");
    return { data: { maxDeviationPercent: value }, message: { code: "PRICE_OVERRIDE_THRESHOLD_UPDATED", text: "Đã cập nhật giới hạn đổi giá" } };
  }
}
