import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateStockInRequest, StockInLine } from "@seafood-pos/schemas";
import Decimal from "decimal.js";
import { computeOverrideDeviationPercent, formatPackageCodeRange, parseWeight, resolvePriceBasis, roundMoney } from "@seafood-pos/utils";
import { randomUUID } from "node:crypto";
import { createBusinessAudit } from "../audit-log/audit-transaction";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_OVERRIDE_LIMIT_PERCENT = new Decimal(20);

@Injectable()
export class StockInService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateStockInRequest, actor: { id: string; role: "ADMIN" | "SELLER" }) {
    return this.prisma.$transaction(async (tx) => {
      const sessionCode = `NH${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
      const session = await tx.stockInSession.create({
        data: { code: sessionCode, note: input.note ?? null, createdById: actor.id },
      });
      const createdPackages: Array<{ id: string; code: string; productName: string; actualWeight: Prisma.Decimal; sellingPrice: Prisma.Decimal }> = [];

      const productIds = [...new Set(input.lines.map((line) => line.productId))].sort();
      const lockedProducts = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(productIds)}) ORDER BY "id" FOR UPDATE`,
      );
      if (lockedProducts.length !== productIds.length) throw new NotFoundException("Một hoặc nhiều sản phẩm không tồn tại");

      for (const line of input.lines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (!product?.isActive) throw new NotFoundException("Sản phẩm không tồn tại hoặc đã ngừng hoạt động");
        if (product.pricingType !== line.pricingType) {
          throw new ConflictException("Kiểu giá sản phẩm vừa thay đổi. Tải lại danh mục rồi thử lại.");
        }

        if (line.packagePresetId != null) {
          const presetLocks = await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`SELECT "id" FROM "PackagePreset" WHERE "id" = ${line.packagePresetId} AND "productId" = ${product.id} FOR UPDATE`,
          );
          if (presetLocks.length === 0) throw new NotFoundException("Không tìm thấy mẫu hộp");
        }
        const preset = line.packagePresetId == null
          ? null
          : await tx.packagePreset.findFirst({
              where: { id: line.packagePresetId, productId: product.id, isActive: true },
            });
        if (line.packagePresetId != null && preset == null) {
          throw new NotFoundException("Mẫu hộp không tồn tại, đã bị ẩn hoặc thuộc sản phẩm khác");
        }

        const defaultValue = line.pricingType === "WEIGHT_BASED"
          ? product.defaultPricePerUnit
          : product.defaultFixedPrice;
        const overrideValue = getOverrideValue(line);
        let deviation: Decimal | null = null;
        let limitExceeded = false;

        if (overrideValue != null) {
          deviation = computeOverrideDeviationPercent(overrideValue, defaultValue);
          if (actor.role === "SELLER") {
            if (deviation == null) {
              throw new ForbiddenException("Sản phẩm chưa có giá mặc định để đối chiếu. Quản lý cần xác nhận giá.");
            }
            const limit = await this.getOverrideLimit(tx);
            if (deviation.greaterThan(limit)) {
              throw new ForbiddenException("Giá chênh quá nhiều, cần Quản lý xác nhận");
            }
          }
          limitExceeded = deviation == null || deviation.greaterThan(await this.getOverrideLimit(tx));
        }

        const updatedSequence = await tx.product.updateMany({
          where: { id: product.id, isActive: true },
          data: { packageSequence: { increment: line.weights.length } },
        });
        if (updatedSequence.count !== 1) throw new NotFoundException("Sản phẩm đã ngừng hoạt động");
        const sequence = await tx.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { packageSequence: true },
        });
        const codes = formatPackageCodeRange(product.code, sequence.packageSequence - line.weights.length, line.weights.length);
        const linePackages: typeof createdPackages = [];

        for (const [index, weightValue] of line.weights.entries()) {
          const weight = new Prisma.Decimal(weightValue);
          const pricingInput = getPricingInput(line, weightValue);
          const pricing = resolvePriceBasis(
            {
              pricingType: product.pricingType,
              defaultPricePerUnit: product.defaultPricePerUnit,
              defaultFixedPrice: product.defaultFixedPrice,
            },
            preset == null
              ? null
              : {
                  weight: preset.weight,
                  pricePerUnit: preset.pricePerUnit,
                  fixedPrice: preset.fixedPrice,
                },
            pricingInput,
          );
          const packageRow = await tx.package.create({
            data: {
              productId: product.id,
              packagePresetId: pricing.presetApplied ? preset?.id ?? null : null,
              code: codes[index]!,
              barcode: codes[index]!,
              actualWeight: weight,
              pricePerUnit: pricing.pricePerUnit == null ? null : new Prisma.Decimal(pricing.pricePerUnit.toFixed()),
              sellingPrice: new Prisma.Decimal(pricing.sellingPrice.toFixed()),
              priceBasis: pricing.priceBasis,
              estimatedCost: product.estimatedCostPerUnit == null
                ? null
                : new Prisma.Decimal(roundMoney(new Decimal(weightValue).times(product.estimatedCostPerUnit.toString())).toFixed()),
              status: "IN_STOCK",
              stockInSessionId: session.id,
              createdById: actor.id,
            },
            select: { id: true, code: true, actualWeight: true, sellingPrice: true },
          });
          await tx.inventoryTransaction.create({
            data: { packageId: packageRow.id, type: "CREATE", createdById: actor.id, note: `Nhập hàng ${session.code}` },
          });
          linePackages.push({ ...packageRow, productName: product.name });
        }

        if (overrideValue != null) {
          await tx.stockInLineAudit.create({
            data: {
              stockInSessionId: session.id,
              productId: product.id,
              overrideType: line.pricingType === "WEIGHT_BASED" ? "OVERRIDE_PER_UNIT" : "OVERRIDE_FIXED",
              overrideValue: new Prisma.Decimal(overrideValue.toFixed()),
              defaultValue: defaultValue == null ? null : new Prisma.Decimal(defaultValue.toString()),
              deviationPercent: deviation == null ? null : new Prisma.Decimal(deviation.toFixed(3)),
              withinThreshold: !limitExceeded,
              approvedById: actor.role === "ADMIN" ? actor.id : null,
            },
          });
          await createBusinessAudit(tx, {
            actorId: actor.id,
            action: "STOCKIN_PRICE_OVERRIDE",
            entityType: "StockInSession",
            entityId: session.id,
            metadata: { productId: product.id, priceBasis: line.pricingType === "WEIGHT_BASED" ? "OVERRIDE_PER_UNIT" : "OVERRIDE_FIXED", withinThreshold: !limitExceeded },
          });
        }

        createdPackages.push(...linePackages);
      }

      await createBusinessAudit(tx, {
        actorId: actor.id,
        action: "STOCK_IN_COMPLETED",
        entityType: "StockInSession",
        entityId: session.id,
        metadata: { packageCount: createdPackages.length, code: session.code },
      });

      return {
        session,
        packageCount: createdPackages.length,
        totalWeight: createdPackages.reduce((sum, item) => sum.plus(item.actualWeight.toString()), new Decimal(0)).toFixed(3),
        packages: createdPackages,
      };
    });
  }

  private async getOverrideLimit(tx: Prisma.TransactionClient): Promise<Decimal> {
    const setting = await tx.appSetting.findUnique({ where: { key: "PRICE_OVERRIDE_MAX_DEVIATION_PERCENT" } });
    if (setting == null) return DEFAULT_OVERRIDE_LIMIT_PERCENT;
    const raw = setting.value;
    if (typeof raw !== "number" && typeof raw !== "string") {
      throw new Error("Thiết lập PRICE_OVERRIDE_MAX_DEVIATION_PERCENT không hợp lệ");
    }
    const parsed = new Decimal(String(raw));
    if (!parsed.isFinite() || parsed.isNegative()) {
      throw new Error("Thiết lập PRICE_OVERRIDE_MAX_DEVIATION_PERCENT phải là số không âm");
    }
    return parsed;
  }
}

function getOverrideValue(line: StockInLine): Decimal | null {
  if (line.pricingType === "WEIGHT_BASED") {
    return line.pricePerUnitOverride == null ? null : new Decimal(line.pricePerUnitOverride);
  }
  return line.fixedPriceOverride == null ? null : new Decimal(line.fixedPriceOverride);
}

function getPricingInput(line: StockInLine, weight: string) {
  const actualWeight = parseWeight(weight);
  if (line.pricingType === "WEIGHT_BASED") {
    return {
      pricingType: "WEIGHT_BASED" as const,
      actualWeight,
      ...(line.pricePerUnitOverride == null ? {} : { pricePerUnitOverride: new Decimal(line.pricePerUnitOverride) }),
    };
  }
  return {
    pricingType: "FIXED_PACKAGE" as const,
    actualWeight,
    ...(line.fixedPriceOverride == null ? {} : { fixedPriceOverride: new Decimal(line.fixedPriceOverride) }),
  };
}
