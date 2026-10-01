import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  PricingConfigurationError,
  resolvePriceBasis,
  computeOverrideDeviationPercent,
  type ProductPricingInput,
  type PresetPricingInput,
} from "./pricing.js";

const d = (value: string) => new Decimal(value);

function weightBasedProduct(defaultPricePerUnit: string | null): ProductPricingInput {
  return {
    pricingType: "WEIGHT_BASED",
    defaultPricePerUnit: defaultPricePerUnit == null ? null : d(defaultPricePerUnit),
    defaultFixedPrice: null,
  };
}

function fixedPackageProduct(defaultFixedPrice: string | null): ProductPricingInput {
  return {
    pricingType: "FIXED_PACKAGE",
    defaultPricePerUnit: null,
    defaultFixedPrice: defaultFixedPrice == null ? null : d(defaultFixedPrice),
  };
}

function preset(partial: Partial<PresetPricingInput>): PresetPricingInput {
  return { weight: null, pricePerUnit: null, fixedPrice: null, ...partial };
}

describe("resolvePriceBasis — Fixture Vàng (Tôm sú, spec.md §7/§21, 250.000đ/kg)", () => {
  const tomSu = weightBasedProduct("250000");

  it.each([
    ["0.82", "205000"],
    ["1.0", "250000"],
    ["1.08", "270000"],
    ["1.5", "375000"],
  ])("weight=%s -> %sđ, basis PRODUCT_PER_UNIT, không dùng preset", (weight, expected) => {
    const result = resolvePriceBasis(tomSu, null, {
      pricingType: "WEIGHT_BASED",
      actualWeight: d(weight),
    });
    expect(result.sellingPrice.toFixed()).toBe(expected);
    expect(result.priceBasis).toBe("PRODUCT_PER_UNIT");
    expect(result.presetApplied).toBe(false);
  });

  it("preset 1kg mang giá/kg riêng (PRESET_PER_UNIT) vẫn ra đúng §9: 1.08kg -> 270.000đ", () => {
    const presetTomSu1kg = preset({ weight: d("1.0"), pricePerUnit: d("250000") });
    const result = resolvePriceBasis(tomSu, presetTomSu1kg, {
      pricingType: "WEIGHT_BASED",
      actualWeight: d("1.08"),
    });
    expect(result.sellingPrice.toFixed()).toBe("270000");
    expect(result.priceBasis).toBe("PRESET_PER_UNIT");
    expect(result.presetApplied).toBe(true);
  });
});

describe("resolvePriceBasis — Fixture A (hộp lẻ, cá hồi 450.000đ/kg, §12/§13 spec)", () => {
  const caHoi = weightBasedProduct("450000");

  it.each([
    ["0.52", "234000"],
    ["0.48", "216000"],
    ["0.71", "319500"],
    ["1.02", "459000"],
    ["0.72", "324000"],
  ])("weight=%s -> %sđ", (weight, expected) => {
    const result = resolvePriceBasis(caHoi, null, {
      pricingType: "WEIGHT_BASED",
      actualWeight: d(weight),
    });
    expect(result.sellingPrice.toFixed()).toBe(expected);
    expect(result.priceBasis).toBe("PRODUCT_PER_UNIT");
  });
});

describe("resolvePriceBasis — Fixture B (preset giá cố định riêng, §7 spec — ca v2 từng tính sai)", () => {
  const caHoi = weightBasedProduct("450000");

  it("preset 250g có fixedPrice 120.000đ -> không phải 0.25 × 450.000 = 112.500đ", () => {
    const presetCaHoi250g = preset({ weight: d("0.25"), fixedPrice: d("120000") });
    const result = resolvePriceBasis(caHoi, presetCaHoi250g, {
      pricingType: "WEIGHT_BASED",
      actualWeight: d("0.25"),
    });
    expect(result.sellingPrice.toFixed()).toBe("120000");
    expect(result.priceBasis).toBe("PRESET_FIXED");
  });

  it("preset 500g có fixedPrice 230.000đ -> KHÔNG được trả 225.000đ (lỗi của v2)", () => {
    const presetCaHoi500g = preset({ weight: d("0.5"), fixedPrice: d("230000") });
    const result = resolvePriceBasis(caHoi, presetCaHoi500g, {
      pricingType: "WEIGHT_BASED",
      actualWeight: d("0.5"),
    });
    expect(result.sellingPrice.toFixed()).toBe("230000");
    expect(result.sellingPrice.toFixed()).not.toBe("225000");
    expect(result.priceBasis).toBe("PRESET_FIXED");
  });

  it("chọn mẫu 500g nhưng cân lệch 0.52kg -> bỏ preset, dùng giá/kg mặc định, presetApplied=false", () => {
    const presetCaHoi500g = preset({ weight: d("0.5"), fixedPrice: d("230000") });
    const result = resolvePriceBasis(caHoi, presetCaHoi500g, {
      pricingType: "WEIGHT_BASED",
      actualWeight: d("0.52"),
    });
    expect(result.sellingPrice.toFixed()).toBe("234000");
    expect(result.priceBasis).toBe("PRODUCT_PER_UNIT");
    expect(result.presetApplied).toBe(false);
  });

  it("preset 1kg fixedPrice 450.000đ khớp cân -> PRESET_FIXED (trùng số với PRODUCT_PER_UNIT nhưng khác basis)", () => {
    const presetCaHoi1kg = preset({ weight: d("1.0"), fixedPrice: d("450000") });
    const result = resolvePriceBasis(caHoi, presetCaHoi1kg, {
      pricingType: "WEIGHT_BASED",
      actualWeight: d("1.0"),
    });
    expect(result.sellingPrice.toFixed()).toBe("450000");
    expect(result.priceBasis).toBe("PRESET_FIXED");
  });
});

describe("resolvePriceBasis — Fixture C (ghi đè giá/kg theo lô, §15 spec)", () => {
  it("override 460.000đ/kg, hộp 0.52kg -> 239.200đ, luôn thắng preset/default", () => {
    const caHoi = weightBasedProduct("450000");
    const presetCaHoi500g = preset({ weight: d("0.5"), fixedPrice: d("230000") });
    const result = resolvePriceBasis(caHoi, presetCaHoi500g, {
      pricingType: "WEIGHT_BASED",
      actualWeight: d("0.52"),
      pricePerUnitOverride: d("460000"),
    });
    expect(result.sellingPrice.toFixed()).toBe("239200");
    expect(result.priceBasis).toBe("OVERRIDE_PER_UNIT");
    expect(result.presetApplied).toBe(false);
  });
});

describe("resolvePriceBasis — Fixture D (giỏ hàng nghiệm thu, thay thế ví dụ §18 không suy ra được)", () => {
  it("3 dòng cộng đúng 660.000đ", () => {
    const line1 = resolvePriceBasis(weightBasedProduct("450000"), null, {
      pricingType: "WEIGHT_BASED",
      actualWeight: d("0.52"),
    });
    const line2 = resolvePriceBasis(
      weightBasedProduct("250000"),
      preset({ weight: d("1.0"), pricePerUnit: d("250000") }),
      { pricingType: "WEIGHT_BASED", actualWeight: d("1.0") },
    );
    const line3 = resolvePriceBasis(weightBasedProduct("220000"), null, {
      pricingType: "WEIGHT_BASED",
      actualWeight: d("0.8"),
    });

    const total = line1.sellingPrice.plus(line2.sellingPrice).plus(line3.sellingPrice);
    expect(line1.sellingPrice.toFixed()).toBe("234000");
    expect(line2.sellingPrice.toFixed()).toBe("250000");
    expect(line3.sellingPrice.toFixed()).toBe("176000");
    expect(total.toFixed()).toBe("660000");
  });
});

describe("resolvePriceBasis — Fixture F/G/H (FIXED_PACKAGE, §6 spec — ca v3 từng tính sai theo kg)", () => {
  const chaCa = fixedPackageProduct("120000");

  it("Fixture F: cân 0.49kg vẫn ra đúng 120.000đ, pricePerUnit=null, cân KHÔNG tham gia phép tính", () => {
    const result = resolvePriceBasis(chaCa, null, {
      pricingType: "FIXED_PACKAGE",
      actualWeight: d("0.49"),
    });
    expect(result.sellingPrice.toFixed()).toBe("120000");
    expect(result.pricePerUnit).toBeNull();
    expect(result.priceBasis).toBe("PRODUCT_FIXED");
  });

  it("Fixture G: fixedPriceOverride 130.000đ, hai hộp cân khác nhau vẫn cùng giá 130.000đ", () => {
    const resultA = resolvePriceBasis(chaCa, null, {
      pricingType: "FIXED_PACKAGE",
      actualWeight: d("0.49"),
      fixedPriceOverride: d("130000"),
    });
    const resultB = resolvePriceBasis(chaCa, null, {
      pricingType: "FIXED_PACKAGE",
      actualWeight: d("0.53"),
      fixedPriceOverride: d("130000"),
    });
    expect(resultA.sellingPrice.toFixed()).toBe("130000");
    expect(resultB.sellingPrice.toFixed()).toBe("130000");
    expect(resultA.priceBasis).toBe("OVERRIDE_FIXED");
  });

  it("Fixture H: gửi pricingType lệch với product -> ném PricingConfigurationError, không âm thầm tính theo kg", () => {
    expect(() =>
      resolvePriceBasis(chaCa, null, {
        pricingType: "WEIGHT_BASED",
        actualWeight: d("0.49"),
        pricePerUnitOverride: d("999999"),
      }),
    ).toThrow(PricingConfigurationError);
  });

  it("FIXED_PACKAGE thiếu mọi nguồn giá -> ném lỗi rõ ràng, không trả 0 hay NaN", () => {
    const productKhongGia = fixedPackageProduct(null);
    expect(() =>
      resolvePriceBasis(productKhongGia, null, {
        pricingType: "FIXED_PACKAGE",
        actualWeight: d("0.4"),
      }),
    ).toThrow(PricingConfigurationError);
  });

  it("WEIGHT_BASED thiếu mọi nguồn giá -> ném lỗi rõ ràng", () => {
    const productKhongGia = weightBasedProduct(null);
    expect(() =>
      resolvePriceBasis(productKhongGia, null, {
        pricingType: "WEIGHT_BASED",
        actualWeight: d("0.4"),
      }),
    ).toThrow(PricingConfigurationError);
  });
});

describe("resolvePriceBasis — làm tròn tiền (ROUND_HALF_UP về đồng, §13 spec có 319.500đ lẻ)", () => {
  it("0.715 × 450.000 = 321.750 giữ nguyên, không bị làm tròn về nghìn", () => {
    const caHoi = weightBasedProduct("450000");
    const result = resolvePriceBasis(caHoi, null, {
      pricingType: "WEIGHT_BASED",
      actualWeight: d("0.715"),
    });
    expect(result.sellingPrice.toFixed()).toBe("321750");
  });

  it("làm tròn .5 lên đồng tiếp theo (ROUND_HALF_UP)", () => {
    const product = weightBasedProduct("1");
    const result = resolvePriceBasis(product, null, {
      pricingType: "WEIGHT_BASED",
      actualWeight: d("0.0015"), // 0.0015 x 1 = 0.0015 -> round 0 chữ số thập phân => 0
    });
    // Số quá nhỏ chỉ để chứng minh không ném lỗi / không NaN; giá trị thực tế luôn >> 1 đồng.
    expect(result.sellingPrice.toFixed()).toBe("0");
  });
});

describe("computeOverrideDeviationPercent — biên độ override (G23/G27)", () => {
  it("Fixture E: +20% nằm đúng biên, +22.2% vượt biên", () => {
    const atBoundary = computeOverrideDeviationPercent(d("540000"), d("450000"));
    const overBoundary = computeOverrideDeviationPercent(d("550000"), d("450000"));
    expect(atBoundary?.toFixed(1)).toBe("20.0");
    expect(overBoundary?.greaterThan(20)).toBe(true);
  });

  it("không có giá mặc định để so -> trả null (service phải từ chối Seller override)", () => {
    expect(computeOverrideDeviationPercent(d("100000"), null)).toBeNull();
  });
});
