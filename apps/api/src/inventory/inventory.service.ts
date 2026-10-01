import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateAdjustmentRequest, InventoryTransactionQuery } from "@seafood-pos/schemas";
import { PrismaService } from "../prisma/prisma.service";
import { createBusinessAudit } from "../audit-log/audit-transaction";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const [products, totals] = await Promise.all([
      this.prisma.product.findMany({
        where: { isActive: true, category: { isActive: true } },
        orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          code: true,
          imageUrl: true,
          lowStockThreshold: true,
          category: { select: { id: true, name: true } },
        },
      }),
      this.prisma.package.groupBy({
        by: ["productId"],
        where: { status: "IN_STOCK", product: { isActive: true } },
        _count: { _all: true },
        _sum: { actualWeight: true, sellingPrice: true },
      }),
    ]);
    const byProduct = new Map(totals.map((row) => [row.productId, row]));
    return products.map((product) => {
      const total = byProduct.get(product.id);
      const boxCount = total?._count._all ?? 0;
      return {
        ...product,
        boxCount,
        totalWeight: total?._sum.actualWeight?.toFixed(3) ?? "0.000",
        totalValue: total?._sum.sellingPrice?.toFixed(0) ?? "0",
        isLowStock: boxCount <= product.lowStockThreshold,
      };
    });
  }

  async packages(productId: string, query: { status: "IN_STOCK" | "SOLD" | "DAMAGED" | "REMOVED"; page: number; pageSize: number }) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new NotFoundException("Không tìm thấy sản phẩm");
    const where = { productId, status: query.status };
    const [items, total] = await Promise.all([
      this.prisma.package.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { code: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { preset: { select: { id: true, name: true } } },
      }),
      this.prisma.package.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async packageByCode(code: string) {
    const packageRow = await this.prisma.package.findFirst({
      where: { OR: [{ code }, { barcode: code }], status: "IN_STOCK", product: { isActive: true } },
      include: { product: { include: { category: true } } },
    });
    if (!packageRow) throw new NotFoundException("Không tìm thấy hộp còn hàng với mã này");
    return packageRow;
  }

  async transactions(query: InventoryTransactionQuery) {
    const where: Prisma.InventoryTransactionWhereInput = {
      ...(query.packageId ? { packageId: query.packageId } : {}),
      ...(query.productId ? { package: { productId: query.productId } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.inventoryTransaction.findMany({
        where,
        include: { package: { include: { product: { select: { id: true, name: true, code: true } } } }, createdBy: { select: { id: true, displayName: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.inventoryTransaction.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  adjust(input: CreateAdjustmentRequest, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const ids = [...new Set(input.packageIds)].sort();
      const locked = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Package" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`,
      );
      if (locked.length !== ids.length) throw new NotFoundException("Một hoặc nhiều hộp không tồn tại");
      const packages = await tx.package.findMany({ where: { id: { in: ids } } });
      const unavailable = packages.filter((item) => item.status !== "IN_STOCK");
      if (unavailable.length > 0) {
        throw new ConflictException(`Chỉ điều chỉnh được hộp còn trong kho: ${unavailable.map((item) => item.code).join(", ")}`);
      }

      const isDamage = input.reason === "DAMAGED" || input.reason === "PACKAGING_TORN";
      const nextStatus = isDamage ? "DAMAGED" : "REMOVED";
      const transactionType = isDamage ? "DAMAGED" : "REMOVED";
      for (const packageRow of packages) {
        await tx.package.update({ where: { id: packageRow.id }, data: { status: nextStatus } });
        await tx.inventoryTransaction.create({
          data: {
            packageId: packageRow.id,
            type: transactionType,
            reason: input.reason,
            note: input.note ?? null,
            createdById: actorId,
          },
        });
      }
      await createBusinessAudit(tx, {
        actorId,
        action: "INVENTORY_ADJUSTED",
        entityType: "Package",
        metadata: { packageIds: ids, reason: input.reason, count: packages.length },
      });
      return { adjustedCount: packages.length, status: nextStatus, packages: packages.map(({ id, code }) => ({ id, code })) };
    });
  }
}
