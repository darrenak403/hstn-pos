import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AUTH_CONFIG, type AuthConfig } from "./auth.config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Mã hoá cặp token lưu tạm trong RefreshTokenGrace bằng khoá KHÔNG nằm trong
 * DB (AUTH_GRACE_ENCRYPTION_KEY, chỉ tồn tại trong biến môi trường của tiến
 * trình API). Review chỉ ra: lưu token thật dạng plaintext trong DB nghĩa là
 * bất kỳ ai đọc được DB trong cửa sổ ân hạn (mặc định 30s) đều lấy được cả
 * access lẫn refresh token còn dùng được. Mã hoá bằng khoá ngoài DB thu hẹp
 * việc này về "đọc được DB VÀ đọc được biến môi trường của tiến trình API".
 */
@Injectable()
export class GraceEncryptionService {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  encryptPair(
    accessToken: string,
    refreshToken: string,
  ): { accessTokenCiphertext: string; refreshTokenCiphertext: string } {
    return {
      accessTokenCiphertext: this.encrypt(accessToken),
      refreshTokenCiphertext: this.encrypt(refreshToken),
    };
  }

  decryptPair(
    accessTokenCiphertext: string,
    refreshTokenCiphertext: string,
  ): { accessToken: string; refreshToken: string } {
    return {
      accessToken: this.decrypt(accessTokenCiphertext),
      refreshToken: this.decrypt(refreshTokenCiphertext),
    };
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.config.graceEncryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
  }

  private decrypt(payload: string): string {
    const raw = Buffer.from(payload, "base64");
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.config.graceEncryptionKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}
