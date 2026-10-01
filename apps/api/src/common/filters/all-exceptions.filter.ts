import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import { PricingConfigurationError } from "@seafood-pos/utils";
import { failureResponse } from "../dto/api-response";

/**
 * Chặn mọi lỗi lọt ra ngoài thành envelope thống nhất — không bao giờ để lộ
 * stack trace hoặc thông điệp kỹ thuật tiếng Anh ra UI người bán hàng.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const errors =
        typeof body === "object" && body !== null && "errors" in body
          ? (body as { errors: { field: string; message: string }[] }).errors
          : null;
      const text =
        typeof body === "object" && body !== null && "message" in body
          ? String((body as { message: unknown }).message)
          : exception.message;
      response.status(status).json(failureResponse({ code: `HTTP_${status}`, text }, errors));
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const status = exception.code === "P2002" ? HttpStatus.CONFLICT : exception.code === "P2025" ? HttpStatus.NOT_FOUND : exception.code === "P2003" ? HttpStatus.CONFLICT : null;
      if (status != null) {
        const text = exception.code === "P2002"
          ? "Mã hoặc tên này đã được sử dụng"
          : exception.code === "P2025"
            ? "Không tìm thấy dữ liệu cần cập nhật"
            : "Không thể thay đổi dữ liệu đang được sử dụng";
        response.status(status).json(failureResponse({ code: exception.code, text }));
        return;
      }
    }

    if (exception instanceof PricingConfigurationError) {
      response
        .status(HttpStatus.CONFLICT)
        .json(failureResponse({ code: "PRICING_CONFIGURATION_ERROR", text: exception.message }));
      return;
    }

    this.logger.error(
      "Lỗi không xác định",
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(failureResponse({ code: "INTERNAL_ERROR", text: "Có lỗi xảy ra, vui lòng thử lại" }));
  }
}
