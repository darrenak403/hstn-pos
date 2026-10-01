import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CreateStockInRequestSchema, type CreateStockInRequest } from "@seafood-pos/schemas";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { StockInService } from "./stock-in.service";

@Controller("api/v1/stock-in")
@UseGuards(JwtAuthGuard)
export class StockInController {
  constructor(private readonly stockIn: StockInService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateStockInRequestSchema)) input: CreateStockInRequest,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const result = await this.stockIn.create(input, user);
    return { data: result, message: { code: "STOCK_IN_COMPLETED", text: `Đã thêm ${result.packageCount} hộp vào kho` } };
  }
}
