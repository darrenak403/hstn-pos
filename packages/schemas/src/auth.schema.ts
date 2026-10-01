import { z } from "zod";

export const LoginRequestSchema = z
  .object({
    username: z.string().min(1, "Bắt buộc nhập tên đăng nhập"),
    password: z.string().min(1, "Bắt buộc nhập mật khẩu"),
    // Máy POS tự sinh 1 lần khi cài (lưu trong config.json, không đổi giữa các
    // lần mở app) — dùng để gắn refresh token với thiết bị (xem auth.service.ts).
    deviceId: z.string().min(1, "Thiếu định danh máy"),
    deviceLabel: z.string().max(100).optional(),
  })
  .strict();

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RefreshRequestSchema = z
  .object({
    refreshToken: z.string().min(1),
    deviceId: z.string().min(1, "Thiếu định danh máy"),
  })
  .strict();

export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const ChangePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8, "Mật khẩu mới phải có ít nhất 8 ký tự"),
  })
  .strict();

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
