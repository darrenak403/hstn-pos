import { redact } from "./redact";

describe("redact", () => {
  it("thay giá trị của các khoá nhạy cảm bằng [REDACTED]", () => {
    const result = redact({
      username: "admin",
      password: "hunter2",
      nested: { refreshToken: "abc.def", note: "ok" },
    });
    expect(result).toEqual({
      username: "admin",
      password: "[REDACTED]",
      nested: { refreshToken: "[REDACTED]", note: "ok" },
    });
  });

  it("không đổi giá trị khi không có khoá nhạy cảm", () => {
    const input = { productId: "p1", weight: "0.52" };
    expect(redact(input)).toEqual(input);
  });

  it("đệ quy vào mảng object", () => {
    const result = redact({ items: [{ token: "x" }, { ok: true }] }) as {
      items: Array<Record<string, unknown>>;
    };
    expect(result.items[0]?.token).toBe("[REDACTED]");
    expect(result.items[1]?.ok).toBe(true);
  });

  it("không phân biệt hoa/thường (PasswordHash vẫn bị chặn)", () => {
    const result = redact({ PasswordHash: "xyz" }) as Record<string, unknown>;
    expect(result.PasswordHash).toBe("[REDACTED]");
  });
});
