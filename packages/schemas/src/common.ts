import { z } from "zod";
import Decimal from "decimal.js";
import { normalizeDecimalInput } from "@seafood-pos/utils";

// Chỉ cho số KHÔNG ÂM — mọi tiền/cân nặng trong hệ thống này không âm theo nghiệp vụ.
const NON_NEGATIVE_DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

function toNormalizedString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return normalizeDecimalInput(value);
}

/**
 * Chuỗi số thập phân không âm, tự chuẩn hoá dấu phẩy kiểu Việt Nam ("1,2" -> "1.2").
 * Mọi tiền/cân nặng đi qua API PHẢI là string qua schema này — không bao giờ dùng
 * z.number() cho tiền/kg (IEEE-754 làm tròn sai, xem packages/utils/src/money.ts).
 */
export const decimalString = () =>
  z.preprocess(
    toNormalizedString,
    z
      .string({ required_error: "Bắt buộc nhập", invalid_type_error: "Phải là chuỗi số" })
      .regex(NON_NEGATIVE_DECIMAL_PATTERN, 'Phải là một số không âm hợp lệ, ví dụ "1.2" hoặc "1,2"'),
  );

/** Như decimalString() nhưng bắt buộc > 0 — dùng cho giá tiền, cân nặng hộp thực tế. */
export const positiveDecimalString = () =>
  decimalString().refine((value) => new Decimal(value).greaterThan(0), {
    message: "Phải lớn hơn 0",
  });

export const weightString = () => positiveDecimalString();
export const moneyString = () => positiveDecimalString();

export const uuidString = () => z.string().uuid("Phải là một UUID hợp lệ");
