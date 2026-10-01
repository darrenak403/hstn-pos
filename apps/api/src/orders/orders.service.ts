import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CancelOrderRequest, CreateOrderRequest, OrderListQuery } from "@seafood-pos/schemas";
import { randomUUID } from "node:crypto";
import { vnDayRange } from "@seafood-pos/utils";
import { createBusinessAudit } from "../audit-log/audit-transaction";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateOrderRequest, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const ids = [...input.packageIds].sort();
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Package" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`,
      );
      if (locked.length !== ids.length) throw new NotFoundException("Một hoặc nhiều hộp không còn tồn tại");

      const packages = await tx.package.findMany({
        where: { id: { in: ids } },
        include: { product: true },
        orderBy: { id: "asc" },
      });
      const unavailable = packages.filter((item) => item.status !== "IN_STOCK");
      if (unavailable.length > 0) {
        throw new ConflictException(`Hộp vừa được bán hoặc điều chỉnh khỏi kho: ${unavailable.map((item) => item.code).join(", ")}`);
      }

      const total = packages.reduce((sum, item) => sum.plus(item.sellingPrice.toString()), new Prisma.Decimal(0));
      const orderCode = `DH${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const order = await tx.order.create({
        data: {
          code: orderCode,
          totalAmount: total,
          paymentStatus: "PAID",
          createdById: actorId,
          items: {
            create: packages.map((item) => ({
              packageId: item.id,
              productId: item.productId,
              productNameSnapshot: item.product.name,
              packageCodeSnapshot: item.code,
              weight: item.actualWeight,
              unitPrice: item.pricePerUnit,
              sellingPrice: item.sellingPrice,
              estimatedCostSnapshot: item.estimatedCost,
            })),
          },
          payments: { create: { method: input.paymentMethod, amount: total } },
        },
        include: { items: true, payments: true },
      });

      const sold = await tx.package.updateMany({ where: { id: { in: ids }, status: "IN_STOCK" }, data: { status: "SOLD" } });
      if (sold.count !== ids.length) throw new ConflictException("Trạng thái hộp vừa thay đổi. Đơn chưa được tạo; hãy tải lại kho.");
      await tx.inventoryTransaction.createMany({
        data: packages.map((item) => ({ packageId: item.id, type: "SALE", orderId: order.id, createdById: actorId })),
      });
      await createBusinessAudit(tx, {
        actorId,
        action: "ORDER_COMPLETED",
        entityType: "Order",
        entityId: order.id,
        metadata: { code: order.code, packageCount: packages.length, totalAmount: total.toFixed(0) },
      });
      return order;
    });
  }

  async list(query: OrderListQuery) {
    const where: Prisma.OrderWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true, payments: true, createdBy: { select: { id: true, displayName: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, payments: true, createdBy: { select: { id: true, displayName: true } }, cancelledBy: { select: { id: true, displayName: true } } },
    });
    if (!order) throw new NotFoundException("Không tìm thấy đơn hàng");
    return order;
  }

  cancel(id: string, input: CancelOrderRequest, actor: { id: string; role: "ADMIN" | "SELLER" }) {
    return this.prisma.$transaction(async (tx) => {
      const lockedOrder = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`,
      );
      if (lockedOrder.length === 0) throw new NotFoundException("Không tìm thấy đơn hàng");
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: { include: { package: true } } },
      });
      if (!order) throw new NotFoundException("Không tìm thấy đơn hàng");
      if (order.status !== "COMPLETED") throw new ConflictException("Đơn hàng này đã được hủy");

      const now = new Date();
      const ageMs = now.getTime() - order.createdAt.getTime();
      if (actor.role === "SELLER" && (ageMs < 0 || ageMs > 15 * 60_000)) {
        throw new ForbiddenException("Người bán chỉ có thể hủy đơn trong 15 phút sau khi bán");
      }
      if (actor.role === "ADMIN") {
        const today = vnDayRange(now);
        if (order.createdAt < today.start || order.createdAt >= today.end) {
          throw new ForbiddenException("Quản lý chỉ có thể hủy đơn được tạo trong ngày hôm nay");
        }
      }

      const packageIds = order.items.map((item) => item.packageId).sort();
      const lockedPackages = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Package" WHERE "id" IN (${Prisma.join(packageIds)}) ORDER BY "id" FOR UPDATE`,
      );
      if (lockedPackages.length !== packageIds.length) throw new ConflictException("Không thể hoàn kho vì thiếu dữ liệu hộp của đơn");
      const unavailable = order.items.filter((item) => item.package.status !== "SOLD");
      if (unavailable.length > 0) throw new ConflictException("Không thể hoàn kho vì trạng thái một hộp đã thay đổi");

      const restored = await tx.package.updateMany({ where: { id: { in: packageIds }, status: "SOLD" }, data: { status: "IN_STOCK" } });
      if (restored.count !== packageIds.length) throw new ConflictException("Trạng thái hộp vừa thay đổi. Đơn chưa được hủy.");
      await tx.inventoryTransaction.createMany({
        data: packageIds.map((packageId) => ({
          packageId,
          type: "SALE_REVERSED",
          orderId: order.id,
          note: input.reason,
          createdById: actor.id,
        })),
      });
      const cancelled = await tx.order.update({
        where: { id },
        data: { status: "CANCELLED", cancelledAt: now, cancelledById: actor.id, cancelReason: input.reason },
        include: { items: true, payments: true },
      });
      await createBusinessAudit(tx, {
        actorId: actor.id,
        action: "ORDER_CANCELLED",
        entityType: "Order",
        entityId: id,
        metadata: { code: order.code, reason: input.reason },
      });
      return cancelled;
    });
  }
}
