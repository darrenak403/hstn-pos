import Decimal from "decimal.js";

/**
 * Mọi phép tính tiền/cân trong hệ thống PHẢI đi qua decimal.js — không bao giờ
 * dùng `number` thuần (IEEE-754 làm tròn sai, ví dụ 0.1 + 0.2 !== 0.3). Số tiền
 * và cân nặng đi qua API luôn là `string` (xem packages/schemas/src/common.ts),
 * không phải `number`/object Decimal.
 */

// decimal.js mặc định ROUND_HALF_UP là giá trị 4, nhưng ta khai báo tường minh
// để không phụ thuộc vào default của thư viện nếu sau này đổi version.
const MONEY_ROUNDING = Decimal.ROUND_HALF_UP;

/** Làm tròn tiền về đồng nguyên (0 chữ số thập phân), luôn làm tròn lên ở mức .5. */
export function roundMoney(value: Decimal): Decimal {
  return value.toDecimalPlaces(0, MONEY_ROUNDING);
}

/** Parse một chuỗi tiền (có thể dùng dấu phẩy kiểu Việt Nam) thành Decimal. */
export function parseMoney(input: string): Decimal {
  return new Decimal(normalizeDecimalInput(input));
}

/** Parse một chuỗi cân nặng (kg) thành Decimal, giữ nguyên độ chính xác (gram). */
export function parseWeight(input: string): Decimal {
  return new Decimal(normalizeDecimalInput(input));
}

/**
 * Chuẩn hoá input số kiểu Việt Nam ("1,2") về dạng decimal.js hiểu được ("1.2").
 * Chỉ thay dấu phẩy khi nó đóng vai trò dấu thập phân (không có dấu chấm nào khác),
 * để không phá input đã đúng chuẩn quốc tế.
 */
export function normalizeDecimalInput(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes(".")) return trimmed;
  return trimmed.replace(",", ".");
}

/** Chuyển Decimal thành string ổn định để trả qua API (không dùng toString() trần vì có thể in dạng mũ). */
export function decimalToApiString(value: Decimal): string {
  return value.toFixed();
}
