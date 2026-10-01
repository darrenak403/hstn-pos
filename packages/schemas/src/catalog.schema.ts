import { z } from "zod";
import { moneyString, positiveDecimalString, uuidString, weightString } from "./common.js";

/**
 * Mẫu hộp (Package Preset) — tách nhánh theo pricingType NGAY TẠI SCHEMA để chặn
 * cấu hình sai từ sớm (ví dụ gán pricePerUnit cho mẫu hộp của sản phẩm
 * FIXED_PACKAGE — lỗ hổng mà packages/utils/src/pricing.ts có thể âm thầm bỏ qua
 * vì chỉ đọc preset.fixedPrice ở nhánh đó, không báo cho Admin biết họ đã nhập
 * nhầm trường). Service tầng trên (apps/api/src/products) vẫn phải đối chiếu
 * `pricingType` ở đây với `Product.pricingType` thật trong DB trước khi lưu.
 */
const WeightBasedPresetInput = z
  .object({
    pricingType: z.literal("WEIGHT_BASED"),
    name: z.string().min(1, "Bắt buộc nhập tên mẫu hộp").max(100),
    weight: weightString(),
    // Mẫu có thể mang giá/kg riêng (Tôm sú 1kg, §9 spec) HOẶC giá cố định riêng
    // (Cá hồi 500g = 230.000đ, §7 spec) — ít nhất một trong hai, không bắt buộc cả hai.
    pricePerUnit: positiveDecimalString().optional(),
    fixedPrice: positiveDecimalString().optional(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .strict();

const FixedPackagePresetInput = z
  .object({
    pricingType: z.literal("FIXED_PACKAGE"),
    name: z.string().min(1, "Bắt buộc nhập tên mẫu hộp").max(100),
    // Cân nặng chỉ để thống kê kg tồn kho (§20 spec), KHÔNG dùng để tính giá.
    weight: weightString().optional(),
    fixedPrice: positiveDecimalString(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .strict();

export const PackagePresetInputSchema = z
  .discriminatedUnion("pricingType", [WeightBasedPresetInput, FixedPackagePresetInput])
  .refine(
    (data) =>
      data.pricingType !== "WEIGHT_BASED" || data.pricePerUnit != null || data.fixedPrice != null,
    {
      message: "Mẫu hộp tính theo khối lượng phải có ít nhất giá/kg hoặc giá cố định riêng",
      path: ["pricePerUnit"],
    },
  );

export type PackagePresetInput = z.infer<typeof PackagePresetInputSchema>;

/**
 * Product — cùng lý do tách nhánh như trên: defaultPricePerUnit chỉ hợp lệ với
 * WEIGHT_BASED, defaultFixedPrice chỉ hợp lệ với FIXED_PACKAGE.
 */
const WeightBasedProductInput = z
  .object({
    pricingType: z.literal("WEIGHT_BASED"),
    categoryId: uuidString(),
    name: z.string().min(1, "Bắt buộc nhập tên sản phẩm").max(100),
    imageUrl: z.string().url().optional(),
    code: z
      .string()
      .min(2)
      .max(10)
      .regex(/^[A-Z0-9]+$/, "Mã sản phẩm chỉ gồm chữ in hoa và số, ví dụ TS, CH"),
    baseUnit: z.string().default("kg"),
    defaultPricePerUnit: moneyString(),
    estimatedCostPerUnit: moneyString().optional(),
    lowStockThreshold: z.number().int().min(0).default(5),
  })
  .strict();

const FixedPackageProductInput = z
  .object({
    pricingType: z.literal("FIXED_PACKAGE"),
    categoryId: uuidString(),
    name: z.string().min(1, "Bắt buộc nhập tên sản phẩm").max(100),
    imageUrl: z.string().url().optional(),
    code: z
      .string()
      .min(2)
      .max(10)
      .regex(/^[A-Z0-9]+$/, "Mã sản phẩm chỉ gồm chữ in hoa và số, ví dụ TS, CH"),
    baseUnit: z.string().default("kg"),
    defaultFixedPrice: moneyString(),
    estimatedCostPerUnit: moneyString().optional(),
    lowStockThreshold: z.number().int().min(0).default(5),
  })
  .strict();

export const CreateProductRequestSchema = z.discriminatedUnion("pricingType", [
  WeightBasedProductInput,
  FixedPackageProductInput,
]);

export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

export const CreateCategoryRequestSchema = z
  .object({
    name: z.string().min(1, "Bắt buộc nhập tên danh mục").max(100),
    imageUrl: z.string().url().optional(),
    icon: z.string().max(50).optional(),
    sortOrder: z.number().int().min(0).default(0),
  })
  .strict();

export type CreateCategoryRequest = z.infer<typeof CreateCategoryRequestSchema>;

export const UpdateCategoryRequestSchema = CreateCategoryRequestSchema;
export type UpdateCategoryRequest = z.infer<typeof UpdateCategoryRequestSchema>;

export const UpdateProductRequestSchema = CreateProductRequestSchema;
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

export const CategoryStatusRequestSchema = z.object({ isActive: z.boolean() }).strict();
export const ProductStatusRequestSchema = z.object({ isActive: z.boolean() }).strict();

export const CatalogListQuerySchema = z
  .object({
    categoryId: uuidString().optional(),
    includeInactive: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
  })
  .strict();
export type CatalogListQuery = z.infer<typeof CatalogListQuerySchema>;

export const PackagePresetStatusRequestSchema = z.object({ isActive: z.boolean() }).strict();
