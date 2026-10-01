import { describe, expect, it } from "vitest";
import { PackagePresetInputSchema } from "./catalog.schema.js";

describe("PackagePresetInputSchema — Fixture J (chặn preset sai kiểu giá)", () => {
  it("preset FIXED_PACKAGE kèm pricePerUnit -> parse fail (.strict() từ chối field lạ)", () => {
    const result = PackagePresetInputSchema.safeParse({
      pricingType: "FIXED_PACKAGE",
      name: "Hộp 500g",
      pricePerUnit: "450000",
      fixedPrice: "120000",
    });
    expect(result.success).toBe(false);
  });

  it("preset WEIGHT_BASED thiếu cả pricePerUnit lẫn fixedPrice -> parse fail", () => {
    const result = PackagePresetInputSchema.safeParse({
      pricingType: "WEIGHT_BASED",
      name: "Hộp 500g",
      weight: "0.5",
    });
    expect(result.success).toBe(false);
  });

  it("preset WEIGHT_BASED chỉ có fixedPrice riêng (không có pricePerUnit) -> hợp lệ (§7 spec)", () => {
    const result = PackagePresetInputSchema.safeParse({
      pricingType: "WEIGHT_BASED",
      name: "Hộp 500g",
      weight: "0.5",
      fixedPrice: "230000",
    });
    expect(result.success).toBe(true);
  });

  it("preset FIXED_PACKAGE hợp lệ", () => {
    const result = PackagePresetInputSchema.safeParse({
      pricingType: "FIXED_PACKAGE",
      name: "Hộp 500g",
      fixedPrice: "120000",
    });
    expect(result.success).toBe(true);
  });
});
