import { z } from "zod";
import { uuidString } from "./common.js";

const PageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

export const InventoryPackageQuerySchema = PageQuerySchema.extend({
  status: z.enum(["IN_STOCK", "SOLD", "DAMAGED", "REMOVED"]).default("IN_STOCK"),
}).strict();

const ValidDateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Phải là ngày hợp lệ theo định dạng YYYY-MM-DD");

function validateDateRange<T extends { from?: string | undefined; to?: string | undefined }>(
  value: T,
  context: z.RefinementCtx,
): void {
  if (value.from != null && value.to != null && Date.parse(value.from) > Date.parse(value.to)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc", path: ["from"] });
  }
}

export const DashboardQuerySchema = z.object({ date: ValidDateOnlySchema.optional() }).strict();
export type InventoryPackageQuery = z.infer<typeof InventoryPackageQuerySchema>;

export const InventoryTransactionQuerySchema = PageQuerySchema.extend({
  productId: uuidString().optional(),
  packageId: uuidString().optional(),
  type: z.enum(["CREATE", "SALE", "SALE_REVERSED", "DAMAGED", "REMOVED"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine(validateDateRange);
export type InventoryTransactionQuery = z.infer<typeof InventoryTransactionQuerySchema>;

export const CreateOrderRequestSchema = z
  .object({
    packageIds: z.array(uuidString()).min(1).max(100),
    paymentMethod: z.enum(["CASH", "TRANSFER"]),
  })
  .strict()
  .refine((value) => new Set(value.packageIds).size === value.packageIds.length, {
    message: "Một hộp không thể xuất hiện hai lần trong đơn",
    path: ["packageIds"],
  });
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const CancelOrderRequestSchema = z
  .object({ reason: z.string().min(1).max(500) })
  .strict();
export type CancelOrderRequest = z.infer<typeof CancelOrderRequestSchema>;

export const OrderListQuerySchema = PageQuerySchema.extend({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.enum(["COMPLETED", "CANCELLED"]).optional(),
}).strict().superRefine(validateDateRange);
export type OrderListQuery = z.infer<typeof OrderListQuerySchema>;

export const ReportQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    date: ValidDateOnlySchema.optional(),
    groupBy: z.enum(["day", "product"]).default("day"),
  })
  .strict()
  .superRefine(validateDateRange);
export type ReportQuery = z.infer<typeof ReportQuerySchema>;

export const CreateUserRequestSchema = z
  .object({
    username: z.string().min(3).max(50).regex(/^[A-Za-z0-9._-]+$/),
    password: z.string().min(8).max(200),
    displayName: z.string().min(1).max(100),
    role: z.enum(["ADMIN", "SELLER"]),
  })
  .strict();
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z
  .object({ displayName: z.string().min(1).max(100), role: z.enum(["ADMIN", "SELLER"]) })
  .strict();
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const UserStatusRequestSchema = z.object({ isActive: z.boolean() }).strict();
export const ResetUserPasswordRequestSchema = z.object({ password: z.string().min(8).max(200) }).strict();
export const AuditLogQuerySchema = PageQuerySchema.extend({
  category: z.enum(["BUSINESS", "SECURITY"]).optional(),
  action: z.string().min(1).max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine(validateDateRange);
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
export const PriceOverrideSettingSchema = z
  .object({ maxDeviationPercent: z.number().min(0).max(1000) })
  .strict();
export type PriceOverrideSetting = z.infer<typeof PriceOverrideSettingSchema>;
