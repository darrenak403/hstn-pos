import { BadRequestException, Injectable } from "@nestjs/common";
import type { ReportQuery } from "@seafood-pos/schemas";
import Decimal from "decimal.js";
import { vnDateKey, vnDayRange, vnLastNDays, vnToday } from "@seafood-pos/utils";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(date?: string) {
    const range = date ? vnDayRange(new Date(`${date}T12:00:00+07:00`)) : vnToday();
    const [sales, itemTotals, activeProducts, inStockTotals] = await Promise.all([
      this.prisma.order.aggregate({
        where: { status: "COMPLETED", createdAt: { gte: range.start, lt: range.end } },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.orderItem.aggregate({
        where: { order: { status: "COMPLETED", createdAt: { gte: range.start, lt: range.end } } },
        _count: { _all: true },
        _sum: { weight: true },
      }),
      this.prisma.product.findMany({
        where: { isActive: true, category: { isActive: true } },
        select: { id: true, name: true, code: true, lowStockThreshold: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.package.groupBy({
        by: ["productId"],
        where: { status: "IN_STOCK", product: { isActive: true } },
        _count: { _all: true },
        _sum: { actualWeight: true },
      }),
    ]);
    const inventory = new Map(inStockTotals.map((row) => [row.productId, row]));
    const lowStock = activeProducts.flatMap((product) => {
      const row = inventory.get(product.id);
      const boxCount = row?._count._all ?? 0;
      return boxCount <= product.lowStockThreshold
        ? [{ productId: product.id, productName: product.name, code: product.code, boxCount, threshold: product.lowStockThreshold }]
        : [];
    });
    return {
      date: date ?? vnDateKey(),
      revenue: sales._sum.totalAmount?.toFixed(0) ?? "0",
      orderCount: sales._count._all,
      boxCount: itemTotals._count._all,
      totalWeight: itemTotals._sum.weight?.toFixed(3) ?? "0.000",
      lowStock,
    };
  }

  async sales(query: ReportQuery) {
    const range = this.resolveRange(query);
    const rows = await this.prisma.orderItem.findMany({
      where: { order: { status: "COMPLETED", createdAt: { gte: range.start, lt: range.end } } },
      select: {
        productId: true,
        productNameSnapshot: true,
        weight: true,
        sellingPrice: true,
        order: { select: { createdAt: true } },
      },
      orderBy: { order: { createdAt: "asc" } },
    });
    const groups = new Map<string, { key: string; productId?: string; productName?: string; boxCount: number; totalWeight: Decimal; revenue: Decimal }>();
    for (const item of rows) {
      const key = query.groupBy === "day"
        ? vnDateKey(item.order.createdAt)
        : `${item.productId}\u0000${item.productNameSnapshot}`;
      const group = groups.get(key) ?? {
        key: query.groupBy === "day" ? key : `${item.productNameSnapshot}`,
        ...(query.groupBy === "product" ? { productId: item.productId, productName: item.productNameSnapshot } : {}),
        boxCount: 0,
        totalWeight: new Decimal(0),
        revenue: new Decimal(0),
      };
      group.boxCount += 1;
      group.totalWeight = group.totalWeight.plus(item.weight.toString());
      group.revenue = group.revenue.plus(item.sellingPrice.toString());
      groups.set(key, group);
    }
    return {
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      groupBy: query.groupBy,
      items: [...groups.values()].map((group) => ({
        key: group.key,
        ...(group.productId ? { productId: group.productId, productName: group.productName } : {}),
        boxCount: group.boxCount,
        totalWeight: group.totalWeight.toFixed(3),
        revenue: group.revenue.toFixed(0),
      })),
    };
  }

  async frequent() {
    const range = vnLastNDays(30);
    const sales = await this.prisma.orderItem.groupBy({
      by: ["productId"],
      where: { order: { status: "COMPLETED", createdAt: { gte: range.start, lt: range.end } } },
      _count: { _all: true },
      orderBy: { _count: { productId: "desc" } },
      take: 8,
    });
    if (sales.length === 0) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: sales.map((row) => row.productId) }, isActive: true, category: { isActive: true } },
      include: { category: true },
    });
    const productsById = new Map(products.map((product) => [product.id, product]));
    return sales.flatMap((row) => {
      const product = productsById.get(row.productId);
      return product ? [{ ...product, soldPackageCount: row._count._all }] : [];
    });
  }

  private resolveRange(query: ReportQuery) {
    let range: { start: Date; end: Date };
    if (query.date) {
      range = vnDayRange(new Date(`${query.date}T12:00:00+07:00`));
    } else if (query.from != null || query.to != null) {
      const start = query.from ? new Date(query.from) : vnToday().start;
      const end = query.to ? new Date(query.to) : vnToday().end;
      range = { start, end: new Date(end.getTime() + 1) };
    } else {
      range = vnLastNDays(7);
    }
    if (range.end.getTime() - range.start.getTime() > 366 * 24 * 60 * 60_000) {
      throw new BadRequestException("Khoảng báo cáo không được vượt quá 366 ngày");
    }
    return range;
  }
}
