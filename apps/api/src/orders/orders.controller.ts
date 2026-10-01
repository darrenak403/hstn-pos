import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { CancelOrderRequestSchema, CreateOrderRequestSchema, OrderListQuerySchema, type CancelOrderRequest, type CreateOrderRequest, type OrderListQuery } from "@seafood-pos/schemas";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { OrdersService } from "./orders.service";

@Controller("api/v1/orders")
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(CreateOrderRequestSchema)) input: CreateOrderRequest,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const order = await this.orders.create(input, user.id);
    return { data: order, message: { code: "ORDER_COMPLETED", text: `Đã bán ${order.items.length} hộp, tổng ${order.totalAmount.toFixed(0)} đồng` } };
  }

  @Get()
  async list(@Query(new ZodValidationPipe(OrderListQuerySchema)) query: OrderListQuery) {
    return { data: await this.orders.list(query), message: { code: "ORDERS", text: "Danh sách đơn hàng" } };
  }

  @Get(":id")
  async get(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.orders.get(id), message: { code: "ORDER", text: "Chi tiết đơn hàng" } };
  }

  @Post(":id/cancel")
  async cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CancelOrderRequestSchema)) input: CancelOrderRequest,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const order = await this.orders.cancel(id, input, user);
    return { data: order, message: { code: "ORDER_CANCELLED", text: "Đã hủy đơn và hoàn hộp về kho" } };
  }
}
