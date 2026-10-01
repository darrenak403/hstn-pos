/**
 * Việt Nam dùng múi giờ cố định UTC+7, không có giờ mùa hè — nên dùng offset cố
 * định thay vì Intl.DateTimeFormat(timeZone) là an toàn và không phụ thuộc vào
 * dữ liệu tz của môi trường chạy (Node bundler trong Tauri có thể thiếu ICU đầy
 * đủ). Mọi mốc "hôm nay" của dashboard/báo cáo PHẢI đi qua module này, không tự
 * tính bằng `new Date().getDate()` (sẽ lấy giờ hệ thống của máy chạy, có thể là
 * UTC trong container Docker → sai lệch múi giờ).
 */

const VN_OFFSET_MINUTES = 7 * 60;
const DAY_MILLIS = 24 * 60 * 60_000;

export interface DayRange {
  /** Mốc bắt đầu ngày (00:00:00 giờ VN), biểu diễn dưới dạng Date UTC. */
  start: Date;
  /** Mốc kết thúc ngày (loại trừ, tức 00:00:00 giờ VN ngày hôm sau). */
  end: Date;
}

/** Khoảng [start, end) theo giờ VN của ngày chứa thời điểm `at`. */
export function vnDayRange(at: Date = new Date()): DayRange {
  const vnShiftedMillis = at.getTime() + VN_OFFSET_MINUTES * 60_000;
  const vnShifted = new Date(vnShiftedMillis);

  const vnMidnightUtcMillis =
    Date.UTC(vnShifted.getUTCFullYear(), vnShifted.getUTCMonth(), vnShifted.getUTCDate(), 0, 0, 0, 0) -
    VN_OFFSET_MINUTES * 60_000;

  return {
    start: new Date(vnMidnightUtcMillis),
    end: new Date(vnMidnightUtcMillis + DAY_MILLIS),
  };
}

/** Khoảng ngày "hôm nay" theo giờ VN tính từ thời điểm hiện tại. */
export function vnToday(): DayRange {
  return vnDayRange(new Date());
}

/** Khoảng N ngày gần nhất theo giờ VN, bao gồm cả hôm nay (ví dụ "7 ngày qua"). */
export function vnLastNDays(days: number, at: Date = new Date()): DayRange {
  if (!Number.isInteger(days) || days <= 0) {
    throw new RangeError(`Số ngày phải là số nguyên dương, nhận được: ${days}`);
  }
  const today = vnDayRange(at);
  return {
    start: new Date(today.start.getTime() - (days - 1) * DAY_MILLIS),
    end: today.end,
  };
}

/** Chuỗi "YYYY-MM-DD" theo lịch VN của thời điểm `at` — dùng đặt tên StockInSession, nhóm báo cáo theo ngày. */
export function vnDateKey(at: Date = new Date()): string {
  const vnShifted = new Date(at.getTime() + VN_OFFSET_MINUTES * 60_000);
  const year = vnShifted.getUTCFullYear();
  const month = String(vnShifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(vnShifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
