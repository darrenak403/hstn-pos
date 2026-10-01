import { describe, expect, it } from "vitest";
import { ReportQuerySchema, DashboardQuerySchema } from "./operations.schema.js";

describe("report date query validation", () => {
  it("rejects impossible calendar dates before date arithmetic reaches Prisma", () => {
    expect(DashboardQuerySchema.safeParse({ date: "2026-02-30" }).success).toBe(false);
    expect(ReportQuerySchema.safeParse({ date: "2026-13-01" }).success).toBe(false);
  });

  it("orders datetime ranges by their actual instants, including timezone offsets", () => {
    const result = ReportQuerySchema.safeParse({
      from: "2026-01-01T00:30:00+02:00",
      to: "2025-12-31T22:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});
