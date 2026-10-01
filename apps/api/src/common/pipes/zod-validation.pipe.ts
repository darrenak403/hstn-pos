import { BadRequestException, Injectable, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

/**
 * Thay cho ValidationPipe mặc định của Nest (dựa trên class-validator) — toàn bộ
 * hệ thống dùng Zod để FE/BE dùng chung đúng một bộ schema (xem packages/schemas).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "(root)",
        message: issue.message,
      }));
      throw new BadRequestException({ message: "Dữ liệu không hợp lệ", errors });
    }
    return result.data;
  }
}
