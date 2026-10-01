/**
 * Sinh mã Package dạng "TS00042" — tiền tố là Product.code, số thứ tự 5 chữ số.
 * Số thứ tự PHẢI đến từ một phép tăng atomic ở tầng DB (Product.packageSequence,
 * UPDATE ... RETURNING trong cùng transaction với insert Package) — hàm ở đây chỉ
 * lo định dạng chuỗi, không lo cấp số, để tránh race condition giữa hai phiên
 * thêm hàng đồng thời (xem apps/api/src/stock-in/stock-in.service.ts, bước sau).
 */
export function formatPackageCode(productCode: string, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new RangeError(`Số thứ tự Package phải là số nguyên dương, nhận được: ${sequence}`);
  }
  return `${productCode}${String(sequence).padStart(5, "0")}`;
}

/**
 * Sinh dãy mã liên tiếp cho N hộp vừa cấp số thứ tự, từ (startSequence + 1) đến
 * (startSequence + count) — dùng khi "Tạo nhiều hộp giống nhau" (§11 spec).
 */
export function formatPackageCodeRange(
  productCode: string,
  startSequence: number,
  count: number,
): string[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new RangeError(`Số lượng hộp phải là số nguyên dương, nhận được: ${count}`);
  }
  return Array.from({ length: count }, (_, index) =>
    formatPackageCode(productCode, startSequence + index + 1),
  );
}
