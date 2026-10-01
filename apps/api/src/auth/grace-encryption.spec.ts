import { randomBytes } from "node:crypto";
import { GraceEncryptionService } from "./grace-encryption";
import type { AuthConfig } from "./auth.config";

function buildService(key: Buffer): GraceEncryptionService {
  const config = { graceEncryptionKey: key } as AuthConfig;
  return new GraceEncryptionService(config);
}

describe("GraceEncryptionService", () => {
  it("mã hoá rồi giải mã lại đúng giá trị gốc", () => {
    const service = buildService(randomBytes(32));

    const { accessTokenCiphertext, refreshTokenCiphertext } = service.encryptPair(
      "access-token-plaintext",
      "refresh-token-plaintext",
    );
    const result = service.decryptPair(accessTokenCiphertext, refreshTokenCiphertext);

    expect(result.accessToken).toBe("access-token-plaintext");
    expect(result.refreshToken).toBe("refresh-token-plaintext");
  });

  it("ciphertext không chứa plaintext dạng chuỗi con", () => {
    const service = buildService(randomBytes(32));

    const { accessTokenCiphertext } = service.encryptPair("super-secret-token", "unused");

    expect(accessTokenCiphertext).not.toContain("super-secret-token");
  });

  it("hai lần mã hoá cùng giá trị cho ra ciphertext khác nhau (IV ngẫu nhiên)", () => {
    const service = buildService(randomBytes(32));

    const first = service.encryptPair("same-value", "same-value");
    const second = service.encryptPair("same-value", "same-value");

    expect(first.accessTokenCiphertext).not.toBe(second.accessTokenCiphertext);
  });

  it("giải mã bằng sai khoá phải ném lỗi (GCM auth tag không khớp), không trả dữ liệu rác", () => {
    const service = buildService(randomBytes(32));
    const wrongKeyService = buildService(randomBytes(32));

    const { accessTokenCiphertext, refreshTokenCiphertext } = service.encryptPair("value-a", "value-b");

    expect(() => wrongKeyService.decryptPair(accessTokenCiphertext, refreshTokenCiphertext)).toThrow();
  });
});
