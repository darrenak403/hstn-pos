import Decimal from "decimal.js";
import { roundMoney } from "./money.js";

/**
 * Bộ tính giá bán hộp — dùng chung tuyệt đối giữa apps/api (tính thật) và apps/pos
 * (preview trước khi gửi). KHÔNG được viết lại phép nhân giá ở bất kỳ nơi nào khác;
 * nếu cần giá, luôn import resolvePriceBasis() từ đây.
 *
 * Lịch sử quyết định (đừng gộp lại chuỗi ưu tiên theo kiểu v2/v3 — đã bị review
 * bác hai lần vì trộn hai kiểu giá vào một chuỗi phẳng):
 *
 *   v2: 5 mức ưu tiên dùng chung cho mọi pricingType → preset 500g cá hồi (giá cố
 *       định 230.000đ, spec.md:206) bị tính nhầm thành 0.5 × 450.000 = 225.000đ.
 *   v3: chốt "giá preset độc lập, không suy ra từ giá/kg" nhưng vẫn đặt override
 *       lên đầu MỘT chuỗi dùng chung cho cả WEIGHT_BASED và FIXED_PACKAGE → sản
 *       phẩm FIXED_PACKAGE có override bị tính theo kg (trái spec.md:186-194).
 *   v4: phân nhánh theo pricingType TRƯỚC, override nằm TRONG từng nhánh. Đây là
 *       bản hiện tại — xem resolveWeightBasedPrice / resolveFixedPackagePrice.
 */

export type PricingType = "WEIGHT_BASED" | "FIXED_PACKAGE";

export type PriceBasis =
  | "OVERRIDE_PER_UNIT"
  | "PRESET_FIXED"
  | "PRESET_PER_UNIT"
  | "PRODUCT_PER_UNIT"
  | "OVERRIDE_FIXED"
  | "PRODUCT_FIXED";

export class PricingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingConfigurationError";
  }
}

export interface ProductPricingInput {
  pricingType: PricingType;
  defaultPricePerUnit: Decimal | null;
  defaultFixedPrice: Decimal | null;
}

export interface PresetPricingInput {
  weight: Decimal | null;
  pricePerUnit: Decimal | null;
  fixedPrice: Decimal | null;
}

export interface WeightBasedLineInput {
  pricingType: "WEIGHT_BASED";
  actualWeight: Decimal;
  pricePerUnitOverride?: Decimal;
}

export interface FixedPackageLineInput {
  pricingType: "FIXED_PACKAGE";
  /** Vẫn ghi nhận để cộng tổng kg tồn kho (§20 spec) — KHÔNG tham gia phép tính giá. */
  actualWeight: Decimal;
  fixedPriceOverride?: Decimal;
}

export type LinePricingInput = WeightBasedLineInput | FixedPackageLineInput;

export interface PricingResult {
  sellingPrice: Decimal;
  /** null khi priceBasis thuộc nhóm giá cố định (OVERRIDE_FIXED/PRESET_FIXED/PRODUCT_FIXED). */
  pricePerUnit: Decimal | null;
  priceBasis: PriceBasis;
  /**
   * true nếu preset thực sự được dùng để ra giá (PRESET_FIXED/PRESET_PER_UNIT).
   * Service gọi hàm này dùng cờ này để quyết định có giữ packagePresetId trên
   * Package hay không — hộp lệch khỏi giá preset thì bỏ liên kết (§9/§12 spec,
   * tránh hộp 0.52kg mang nhãn "mẫu 500g" gây hiểu nhầm khi tra cứu).
   */
  presetApplied: boolean;
}

export function resolvePriceBasis(
  product: ProductPricingInput,
  preset: PresetPricingInput | null,
  line: LinePricingInput,
): PricingResult {
  if (product.pricingType !== line.pricingType) {
    throw new PricingConfigurationError(
      `Dòng hàng khai báo kiểu giá "${line.pricingType}" nhưng sản phẩm đang là "${product.pricingType}". ` +
        "Kiểm tra lại dữ liệu gửi lên, có thể danh mục đã bị đổi kiểu giá sau khi màn hình được mở.",
    );
  }

  return product.pricingType === "FIXED_PACKAGE"
    ? resolveFixedPackagePrice(product, preset, line as FixedPackageLineInput)
    : resolveWeightBasedPrice(product, preset, line as WeightBasedLineInput);
}

function resolveFixedPackagePrice(
  product: ProductPricingInput,
  preset: PresetPricingInput | null,
  line: FixedPackageLineInput,
): PricingResult {
  // 1F — ghi đè giá/hộp cho lô hôm nay, luôn thắng mọi nguồn khác.
  if (line.fixedPriceOverride != null) {
    return {
      sellingPrice: roundMoney(line.fixedPriceOverride),
      pricePerUnit: null,
      priceBasis: "OVERRIDE_FIXED",
      presetApplied: false,
    };
  }

  // 2F — mẫu hộp có giá cố định riêng.
  if (preset?.fixedPrice != null) {
    return {
      sellingPrice: roundMoney(preset.fixedPrice),
      pricePerUnit: null,
      priceBasis: "PRESET_FIXED",
      presetApplied: true,
    };
  }

  // 3F — giá cố định mặc định của sản phẩm.
  if (product.defaultFixedPrice != null) {
    return {
      sellingPrice: roundMoney(product.defaultFixedPrice),
      pricePerUnit: null,
      priceBasis: "PRODUCT_FIXED",
      presetApplied: false,
    };
  }

  throw new PricingConfigurationError(
    "Sản phẩm tính giá theo hộp nhưng chưa có giá hộp (chưa cấu hình mẫu hộp hoặc giá mặc định)",
  );
}

function resolveWeightBasedPrice(
  product: ProductPricingInput,
  preset: PresetPricingInput | null,
  line: WeightBasedLineInput,
): PricingResult {
  const weight = line.actualWeight;

  // 1W — ghi đè giá/kg cho lô hôm nay, luôn thắng mọi nguồn khác.
  if (line.pricePerUnitOverride != null) {
    return {
      sellingPrice: roundMoney(weight.times(line.pricePerUnitOverride)),
      pricePerUnit: line.pricePerUnitOverride,
      priceBasis: "OVERRIDE_PER_UNIT",
      presetApplied: false,
    };
  }

  // 2W — khớp TUYỆT ĐỐI cân nặng với preset có giá cố định riêng (§7 spec: giá
  // preset không suy ra được từ giá/kg). Lệch dù 1 gram cũng rơi xuống dưới.
  if (preset?.weight != null && preset.fixedPrice != null && weight.equals(preset.weight)) {
    return {
      sellingPrice: roundMoney(preset.fixedPrice),
      pricePerUnit: null,
      priceBasis: "PRESET_FIXED",
      presetApplied: true,
    };
  }

  // 3W — preset mang theo một mức giá/kg riêng (ví dụ Tôm sú 1kg–250.000đ, §9
  // spec: hộp thực tế 1.08kg vẫn dùng đúng 250.000đ/kg để tự tính 270.000đ).
  if (preset?.pricePerUnit != null) {
    return {
      sellingPrice: roundMoney(weight.times(preset.pricePerUnit)),
      pricePerUnit: preset.pricePerUnit,
      priceBasis: "PRESET_PER_UNIT",
      presetApplied: true,
    };
  }

  // 4W — giá/kg mặc định của sản phẩm.
  if (product.defaultPricePerUnit != null) {
    return {
      sellingPrice: roundMoney(weight.times(product.defaultPricePerUnit)),
      pricePerUnit: product.defaultPricePerUnit,
      priceBasis: "PRODUCT_PER_UNIT",
      presetApplied: false,
    };
  }

  throw new PricingConfigurationError(
    "Sản phẩm tính theo khối lượng nhưng chưa có giá/kg (chưa cấu hình mẫu hộp hoặc giá mặc định)",
  );
}

/**
 * Kiểm override có nằm trong biên độ cho phép so với giá mặc định CÙNG LOẠI hay
 * không (G23/G27): pricePerUnitOverride đối chiếu defaultPricePerUnit,
 * fixedPriceOverride đối chiếu defaultFixedPrice — không bao giờ so chéo loại.
 * Trả về null nếu sản phẩm chưa có giá mặc định tương ứng để so (khi đó service
 * tầng trên phải từ chối cho Seller override, chỉ Admin được làm).
 */
export function computeOverrideDeviationPercent(
  overrideValue: Decimal,
  defaultValue: Decimal | null,
): Decimal | null {
  if (defaultValue == null || defaultValue.isZero()) return null;
  return overrideValue.minus(defaultValue).dividedBy(defaultValue).times(100).abs();
}
