export type AuthReuseDetectionMode = "log" | "enforce";

export interface AuthConfig {
  accessTokenSecret: string;
  accessTokenTtlSeconds: number;
  refreshPepper: string;
  refreshTokenTtlDays: number;
  /** Cửa sổ ân hạn (giây) sau khi xoay 1 refresh token — xem refresh-token.repository.ts. */
  refreshGraceSeconds: number;
  /**
   * "log"     — bake-in: chỉ ghi AuditLog khi phát hiện tái sử dụng, KHÔNG thu
   *             hồi phiên nào khác. Dùng tối thiểu 2 tuần trước khi chuyển sang
   *             "enforce" (xem docs/ops/go-live-checklist.md, mục 10.8).
   * "enforce" — thu hồi toàn bộ family token khi phát hiện tái sử dụng thật.
   */
  reuseDetectionMode: AuthReuseDetectionMode;
  /** Khoá AES-256-GCM (32 byte) mã hoá token trong RefreshTokenGrace — xem grace-encryption.ts. */
  graceEncryptionKey: Buffer;
}

export const AUTH_CONFIG = Symbol("AUTH_CONFIG");

export function loadAuthConfigFromEnv(env: NodeJS.ProcessEnv): AuthConfig {
  return {
    accessTokenSecret: requireEnv(env, "JWT_ACCESS_SECRET"),
    accessTokenTtlSeconds: Number(env.JWT_ACCESS_TTL_SECONDS ?? 28800),
    refreshPepper: requireEnv(env, "JWT_REFRESH_PEPPER"),
    refreshTokenTtlDays: Number(env.JWT_REFRESH_TTL_DAYS ?? 30),
    refreshGraceSeconds: Number(env.REFRESH_GRACE_SECONDS ?? 30),
    reuseDetectionMode: env.AUTH_REUSE_DETECTION_MODE === "enforce" ? "enforce" : "log",
    graceEncryptionKey: loadGraceEncryptionKey(env),
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`Thiếu biến môi trường bắt buộc: ${key}`);
  }
  return value;
}

function loadGraceEncryptionKey(env: NodeJS.ProcessEnv): Buffer {
  const value = requireEnv(env, "AUTH_GRACE_ENCRYPTION_KEY");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    // Cố ý throw thay vì chấp nhận key sai độ dài — một key ngắn hơn làm AES-256
    // yếu đi âm thầm, một giá trị không phải base64 hợp lệ tạo key rác không
    // cảnh báo. Thà chặn khởi động còn hơn mã hoá bằng khoá sai.
    throw new Error(
      "AUTH_GRACE_ENCRYPTION_KEY phải là chuỗi base64 mã hoá đúng 32 byte (AES-256). " +
        "Tạo bằng: openssl rand -base64 32",
    );
  }
  return key;
}
