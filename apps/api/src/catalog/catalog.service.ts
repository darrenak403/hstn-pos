import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PricingType } from "@prisma/client";
import type {
  CreateCategoryRequest,
  CatalogListQuery,
  CreateProductRequest,
  PackagePresetInput,
  UpdateCategoryRequest,
  UpdateProductRequest,
} from "@seafood-pos/schemas";
import { PrismaService } from "../prisma/prisma.service";
import { createBusinessAudit } from "../audit-log/audit-transaction";

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listCategories(includeInactive = false) {
    return this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
  }

  createCategory(input: CreateCategoryRequest, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.category.create({
        data: {
          name: input.name,
          imageUrl: input.imageUrl ?? null,
          icon: input.icon ?? null,
          sortOrder: input.sortOrder,
        },
      });
      await createBusinessAudit(tx, {
        actorId,
        action: "CATEGORY_CREATED",
        entityType: "Category",
        entityId: category.id,
        metadata: { name: category.name },
      });
      return category;
    });
  }

  async updateCategory(id: string, input: UpdateCategoryRequest, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.category.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Không tìm thấy danh mục");
      const category = await tx.category.update({
        where: { id },
        data: {
          name: input.name,
          imageUrl: input.imageUrl ?? null,
          icon: input.icon ?? null,
          sortOrder: input.sortOrder,
        },
      });
      await createBusinessAudit(tx, {
        actorId,
        action: "CATEGORY_UPDATED",
        entityType: "Category",
        entityId: id,
        metadata: { previousName: current.name, name: category.name },
      });
      return category;
    });
  }

  async setCategoryActive(id: string, isActive: boolean, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Category" WHERE "id" = ${id} FOR UPDATE`);
      const category = await tx.category.findUnique({ where: { id } });
      if (!category) throw new NotFoundException("Không tìm thấy danh mục");
      if (!isActive) {
        const activeProducts = await tx.product.count({ where: { categoryId: id, isActive: true } });
        if (activeProducts > 0) throw new ConflictException("Hãy ẩn sản phẩm đang hoạt động trước khi ẩn danh mục");
      }
      const updated = await tx.category.update({ where: { id }, data: { isActive } });
      await createBusinessAudit(tx, {
        actorId,
        action: isActive ? "CATEGORY_ACTIVATED" : "CATEGORY_DEACTIVATED",
        entityType: "Category",
        entityId: id,
        metadata: { name: category.name },
      });
      return updated;
    });
  }

  listProducts(options: CatalogListQuery) {
    return this.prisma.product.findMany({
      where: {
        ...(options.includeInactive ? {} : { isActive: true }),
        ...(options.categoryId ? { categoryId: options.categoryId } : {}),
        ...(!options.includeInactive ? { category: { isActive: true } } : {}),
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      include: {
        category: true,
        presets: {
          where: options.includeInactive ? {} : { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
        _count: { select: { packages: { where: { status: "IN_STOCK" } } } },
      },
    });
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        presets: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        _count: { select: { packages: { where: { status: "IN_STOCK" } } } },
      },
    });
    if (!product) throw new NotFoundException("Không tìm thấy sản phẩm");
    return product;
  }

  createProduct(input: CreateProductRequest, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Category" WHERE "id" = ${input.categoryId} FOR UPDATE`);
      const category = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!category?.isActive) throw new NotFoundException("Danh mục không tồn tại hoặc đã ngừng hoạt động");
      const product = await tx.product.create({
        data: this.productData(input),
        include: { category: true, presets: true },
      });
      await createBusinessAudit(tx, {
        actorId,
        action: "PRODUCT_CREATED",
        entityType: "Product",
        entityId: product.id,
        metadata: { name: product.name, code: product.code, pricingType: product.pricingType },
      });
      return product;
    });
  }

  async updateProduct(id: string, input: UpdateProductRequest, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`);
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Category" WHERE "id" = ${input.categoryId} FOR UPDATE`);
      const current = await tx.product.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Không tìm thấy sản phẩm");
      const category = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!category?.isActive) throw new NotFoundException("Danh mục không tồn tại hoặc đã ngừng hoạt động");

      if (current.pricingType !== input.pricingType) {
        const incompatible = await tx.packagePreset.count({
          where: { productId: id, isActive: true, pricePerUnit: { not: null } },
        });
        if (input.pricingType === "FIXED_PACKAGE" && incompatible > 0) {
          throw new ConflictException("Hãy sửa hoặc ẩn mẫu hộp có giá/kg trước khi đổi kiểu tính giá");
        }
      }

      const updated = await tx.product.update({
        where: { id },
        data: this.productData(input),
        include: { category: true, presets: { where: { isActive: true } } },
      });
      await createBusinessAudit(tx, {
        actorId,
        action: current.pricingType !== updated.pricingType ? "PRODUCT_PRICING_TYPE_CHANGED" : "PRODUCT_UPDATED",
        entityType: "Product",
        entityId: id,
        metadata: {
          previousName: current.name,
          name: updated.name,
          previousPricingType: current.pricingType,
          pricingType: updated.pricingType,
        },
      });
      return updated;
    });
  }

  async setProductActive(id: string, isActive: boolean, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`);
      const product = await tx.product.findUnique({ where: { id } });
      if (!product) throw new NotFoundException("Không tìm thấy sản phẩm");
      if (!isActive) {
        const inStock = await tx.package.count({ where: { productId: id, status: "IN_STOCK" } });
        if (inStock > 0) throw new ConflictException("Không thể ẩn sản phẩm còn hàng trong kho");
      }
      const updated = await tx.product.update({ where: { id }, data: { isActive } });
      await createBusinessAudit(tx, {
        actorId,
        action: isActive ? "PRODUCT_ACTIVATED" : "PRODUCT_DEACTIVATED",
        entityType: "Product",
        entityId: id,
        metadata: { name: product.name, code: product.code },
      });
      return updated;
    });
  }

  async createPreset(productId: string, input: PackagePresetInput, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`);
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product?.isActive) throw new NotFoundException("Sản phẩm không tồn tại hoặc đã ngừng hoạt động");
      if (product.pricingType !== input.pricingType) {
        throw new ConflictException("Kiểu giá của mẫu hộp không khớp với sản phẩm");
      }
      const preset = await tx.packagePreset.create({
        data: {
          productId,
          name: input.name,
          weight: input.weight == null ? null : new Prisma.Decimal(input.weight),
          pricePerUnit: "pricePerUnit" in input && input.pricePerUnit != null
            ? new Prisma.Decimal(input.pricePerUnit)
            : null,
          fixedPrice: input.fixedPrice == null ? null : new Prisma.Decimal(input.fixedPrice),
          sortOrder: input.sortOrder,
        },
      });
      await createBusinessAudit(tx, {
        actorId,
        action: "PACKAGE_PRESET_CREATED",
        entityType: "PackagePreset",
        entityId: preset.id,
        metadata: { productId, name: preset.name },
      });
      return preset;
    });
  }

  async updatePreset(productId: string, presetId: string, input: PackagePresetInput, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`);
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "PackagePreset" WHERE "id" = ${presetId} AND "productId" = ${productId} FOR UPDATE`);
      const product = await tx.product.findUnique({ where: { id: productId } });
      const current = await tx.packagePreset.findFirst({ where: { id: presetId, productId } });
      if (!product || !current) throw new NotFoundException("Không tìm thấy mẫu hộp");
      if (product.pricingType !== input.pricingType) {
        throw new ConflictException("Kiểu giá của mẫu hộp không khớp với sản phẩm");
      }
      const preset = await tx.packagePreset.update({
        where: { id: presetId },
        data: {
          name: input.name,
          weight: input.weight == null ? null : new Prisma.Decimal(input.weight),
          pricePerUnit: "pricePerUnit" in input && input.pricePerUnit != null
            ? new Prisma.Decimal(input.pricePerUnit)
            : null,
          fixedPrice: input.fixedPrice == null ? null : new Prisma.Decimal(input.fixedPrice),
          sortOrder: input.sortOrder,
        },
      });
      await createBusinessAudit(tx, {
        actorId,
        action: "PACKAGE_PRESET_UPDATED",
        entityType: "PackagePreset",
        entityId: preset.id,
        metadata: { productId, name: preset.name },
      });
      return preset;
    });
  }

  async setPresetActive(productId: string, presetId: string, isActive: boolean, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`);
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "PackagePreset" WHERE "id" = ${presetId} AND "productId" = ${productId} FOR UPDATE`);
      const preset = await tx.packagePreset.findFirst({ where: { id: presetId, productId } });
      if (!preset) throw new NotFoundException("Không tìm thấy mẫu hộp");
      const updated = await tx.packagePreset.update({ where: { id: presetId }, data: { isActive } });
      await createBusinessAudit(tx, {
        actorId,
        action: isActive ? "PACKAGE_PRESET_ACTIVATED" : "PACKAGE_PRESET_DEACTIVATED",
        entityType: "PackagePreset",
        entityId: presetId,
        metadata: { productId, name: preset.name },
      });
      return updated;
    });
  }

  private productData(input: CreateProductRequest | UpdateProductRequest): Prisma.ProductUncheckedCreateInput {
    const common = {
      categoryId: input.categoryId,
      name: input.name,
      imageUrl: input.imageUrl ?? null,
      code: input.code,
      baseUnit: input.baseUnit,
      pricingType: input.pricingType as PricingType,
      defaultPricePerUnit: "defaultPricePerUnit" in input ? new Prisma.Decimal(input.defaultPricePerUnit) : null,
      defaultFixedPrice: "defaultFixedPrice" in input ? new Prisma.Decimal(input.defaultFixedPrice) : null,
      estimatedCostPerUnit: input.estimatedCostPerUnit == null ? null : new Prisma.Decimal(input.estimatedCostPerUnit),
      lowStockThreshold: input.lowStockThreshold,
    };
    return common;
  }
}
