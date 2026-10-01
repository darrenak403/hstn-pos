/**
 * Lọc bí mật khỏi metadata trước khi ghi AuditLog — nhật ký bảo mật không được
 * phép TRỞ THÀNH nơi rò rỉ bí mật (mật khẩu, token...). Chặn theo tên khoá,
 * không phân biệt hoa/thường, đệ quy vào object/array lồng nhau.
 */
const SENSITIVE_KEY_PATTERN =
  /(password|passwordhash|token|refreshtoken|accesstoken|secret|authorization|pepper)/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redact(v),
      ]),
    );
  }
  return value;
}
