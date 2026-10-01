import { describe, expect, it } from "vitest";
import { vnDayRange, vnDateKey } from "./date-vn.js";

describe("vnDayRange — mốc giờ VN không được lệch ngày (R4/R7 trong kế hoạch)", () => {
  it("23:30 giờ VN ngày 01/10 (16:30 UTC) vẫn thuộc ngày 01/10 VN", () => {
    const at = new Date("2026-10-01T16:30:00.000Z"); // = 23:30 VN cùng ngày
    const range = vnDayRange(at);
    expect(range.start.toISOString()).toBe("2026-09-30T17:00:00.000Z"); // 00:00 VN 01/10
    expect(range.end.toISOString()).toBe("2026-10-01T17:00:00.000Z"); // 00:00 VN 02/10
    expect(at >= range.start && at < range.end).toBe(true);
  });

  it("00:30 giờ VN ngày 01/10 (17:30 UTC ngày 30/09) vẫn thuộc ngày 01/10 VN, KHÔNG lùi về 30/09", () => {
    const at = new Date("2026-09-30T17:30:00.000Z"); // = 00:30 VN 01/10
    const range = vnDayRange(at);
    expect(range.start.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-01T17:00:00.000Z");
    expect(at >= range.start && at < range.end).toBe(true);
  });

  it("23:59:59 giờ VN và 00:00:00 giờ VN ngày hôm sau rơi vào hai bucket khác nhau", () => {
    const lastSecond = new Date("2026-10-01T16:59:59.000Z"); // 23:59:59 VN 01/10
    const firstSecond = new Date("2026-10-01T17:00:00.000Z"); // 00:00:00 VN 02/10
    expect(vnDayRange(lastSecond).start.toISOString()).toBe("2026-09-30T17:00:00.000Z");
    expect(vnDayRange(firstSecond).start.toISOString()).toBe("2026-10-01T17:00:00.000Z");
  });
});

describe("vnDateKey", () => {
  it("00:30 giờ VN ngày 01/10 trả về khoá 2026-10-01, không phải 2026-09-30", () => {
    const at = new Date("2026-09-30T17:30:00.000Z");
    expect(vnDateKey(at)).toBe("2026-10-01");
  });
});
