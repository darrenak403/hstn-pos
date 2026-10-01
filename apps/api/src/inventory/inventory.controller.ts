import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import {
  CreateAdjustmentRequestSchema,
  InventoryPackageQuerySchema,
  InventoryTransactionQuerySchema,
  type CreateAdjustmentRequest,
  type InventoryPackageQuery,
  type InventoryTransactionQuery,
} from "@seafood-pos/schemas";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { InventoryService } from "./inventory.service";

@Controller("api/v1")
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get("inventory/summary")
  async summary() {
    return { data: await this.inventory.summary(), message: { code: "INVENTORY_SUMMARY", text: "Tồn kho hiện tại" } };
  }

  @Get("inventory/products/:productId/packages")
  async packages(
    @Param("productId", ParseUUIDPipe) productId: string,
    @Query(new ZodValidationPipe(InventoryPackageQuerySchema)) query: InventoryPackageQuery,
  ) {
    return { data: await this.inventory.packages(productId, query), message: { code: "PACKAGES", text: "Danh sách hộp" } };
  }

  @Get("packages/by-code/:code")
  async packageByCode(@Param("code") code: string) {
    return { data: await this.inventory.packageByCode(code), message: { code: "PACKAGE_FOUND", text: "Đã tìm thấy hộp" } };
  }

  @Get("inventory/transactions")
  @Roles("ADMIN")
  async transactions(@Query(new ZodValidationPipe(InventoryTransactionQuerySchema)) query: InventoryTransactionQuery) {
    return { data: await this.inventory.transactions(query), message: { code: "INVENTORY_TRANSACTIONS", text: "Lịch sử kho" } };
  }

  @Post("inventory/adjustments")
  async adjust(
    @Body(new ZodValidationPipe(CreateAdjustmentRequestSchema)) input: CreateAdjustmentRequest,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const result = await this.inventory.adjust(input, user.id);
    return { data: result, message: { code: "INVENTORY_ADJUSTED", text: `Đã điều chỉnh ${result.adjustedCount} hộp` } };
  }
}
