import { describe, expect, it } from "vitest";
import { CreateStockInRequestSchema } from "./stock-in.schema.js";

const productId = "11111111-1111-1111-1111-111111111111";

describe("StockInLineSchema — Fixture H (chặn override sai kiểu giá ngay tại schema)", () => {
  it("dòng FIXED_PACKAGE kèm pricePerUnitOverride -> parse fail (.strict() từ chối field lạ)", () => {
    const result = CreateStockInRequestSchema.safeParse({
      lines: [
        {
          pricingType: "FIXED_PACKAGE",
          productId,
          pricePerUnitOverride: "999999",
          weights: ["0.49"],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("dòng WEIGHT_BASED kèm fixedPriceOverride -> parse fail", () => {
    const result = CreateStockInRequestSchema.safeParse({
      lines: [
        {
          pricingType: "WEIGHT_BASED",
          productId,
          fixedPriceOverride: "999999",
          weights: ["0.52"],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("dòng hợp lệ (đúng field theo đúng nhánh) -> parse thành công", () => {
    const result = CreateStockInRequestSchema.safeParse({
      lines: [
        { pricingType: "WEIGHT_BASED", productId, pricePerUnitOverride: "460000", weights: ["0.52"] },
        { pricingType: "FIXED_PACKAGE", productId, fixedPriceOverride: "130000", weights: ["0.49", "0.53"] },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("chuẩn hoá dấu phẩy kiểu VN trong weights (\"0,52\" -> \"0.52\")", () => {
    const result = CreateStockInRequestSchema.safeParse({
      lines: [{ pricingType: "WEIGHT_BASED", productId, weights: ["0,52"] }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lines[0]?.weights[0]).toBe("0.52");
    }
  });
});
