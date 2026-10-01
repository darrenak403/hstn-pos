import { createHmac, randomBytes } from "node:crypto";

/**
 * Refresh token chỉ được LƯU dưới dạng hash — nhưng phải là hash XÁC ĐỊNH
 * (deterministic), không phải bcrypt, vì ta cần TRA CỨU theo giá trị trình lên
 * (`WHERE tokenHash = ?`), không chỉ so khớp 1-1 như mật khẩu đăng nhập.
 * HMAC-SHA256 với pepper bí mật (không lưu trong DB) đáp ứng đúng yêu cầu này.
 */
export function hashRefreshToken(pepper: string, token: string): string {
  return createHmac("sha256", pepper).update(token).digest("hex");
}

export function generateRefreshTokenPlaintext(): string {
  return randomBytes(48).toString("base64url");
}
