import { z } from "zod";
import { positiveDecimalString, uuidString, weightString } from "./common.js";

/**
 * Một dòng "Thêm hàng" — tách nhánh theo pricingType NGAY TẠI SCHEMA bằng
 * discriminatedUnion + .strict(): gửi pricePerUnitOverride cho dòng
 * FIXED_PACKAGE (hoặc ngược lại) bị từ chối với 400 trước khi payload chạm tới
 * tầng tính giá (packages/utils/src/pricing.ts có kiểm tra chéo lần hai ở đó,
 * phòng trường hợp danh mục đổi pricingType giữa lúc màn hình đang mở).
 *
 * `weights[]` dùng cho cả 3 kịch bản trong spec:
 *   §11 "10 hộp giống nhau mẫu 500g"  -> weights = Array(10).fill("0.5")
 *   §12 "1 hộp khối lượng khác"       -> weights = ["0.72"]
 *   §13 "nhiều hộp khác khối lượng"   -> weights = ["0.52","0.48","0.71","1.02"]
 * Một mảng duy nhất tránh phải phân nhánh quantity-vs-weights ở tầng service;
 * UI tự khai triển "mẫu x số lượng" thành mảng trước khi gửi.
 */
const WeightBasedStockInLine = z
  .object({
    pricingType: z.literal("WEIGHT_BASED"),
    productId: uuidString(),
    packagePresetId: uuidString().optional(),
    pricePerUnitOverride: positiveDecimalString().optional(),
    weights: z.array(weightString()).min(1, "Phải có ít nhất 1 hộp").max(100, "Mỗi dòng tối đa 100 hộp"),
  })
  .strict();

const FixedPackageStockInLine = z
  .object({
    pricingType: z.literal("FIXED_PACKAGE"),
    productId: uuidString(),
    packagePresetId: uuidString().optional(),
    fixedPriceOverride: positiveDecimalString().optional(),
    // Vẫn bắt buộc cân để cộng tổng kg tồn kho (§20 spec), dù không dùng để tính giá.
    weights: z.array(weightString()).min(1, "Phải có ít nhất 1 hộp").max(100, "Mỗi dòng tối đa 100 hộp"),
  })
  .strict();

export const StockInLineSchema = z.discriminatedUnion("pricingType", [
  WeightBasedStockInLine,
  FixedPackageStockInLine,
]);

export type StockInLine = z.infer<typeof StockInLineSchema>;

export const CreateStockInRequestSchema = z
  .object({
    note: z.string().max(500).optional(),
    lines: z.array(StockInLineSchema).min(1, "Phải có ít nhất 1 dòng hàng").max(100, "Mỗi lần tối đa 100 dòng hàng"),
  })
  .strict()
  .refine((request) => request.lines.reduce((total, line) => total + line.weights.length, 0) <= 100, {
    message: "Mỗi lần thêm kho tối đa 100 hộp. Hãy chia thành nhiều lần.",
    path: ["lines"],
  });

export type CreateStockInRequest = z.infer<typeof CreateStockInRequestSchema>;

export const CreateAdjustmentRequestSchema = z
  .object({
    packageIds: z.array(uuidString()).min(1, "Phải chọn ít nhất 1 hộp"),
    reason: z.enum([
      "DAMAGED",
      "PACKAGING_TORN",
      "HOME_USE",
      "GIFT",
      "WRONG_ENTRY",
      "STOCKTAKE_DIFF",
      "OTHER",
    ]),
    note: z.string().max(500).optional(),
  })
  .strict();

export type CreateAdjustmentRequest = z.infer<typeof CreateAdjustmentRequestSchema>;
