import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { Prisma } from "@prisma/client";
import { type AppMessage, successResponse } from "../dto/api-response";

/**
 * Mọi tiền/kg (Prisma Decimal) và Date đi ra khỏi API đều được chuyển thành
 * string/ISO string ở ĐÚNG MỘT chỗ này — không được serialize rải rác ở từng
 * controller, tránh lặp lại rủi ro R2 (lệch chính xác số khi qua JSON).
 */
function serializeForWire(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value.toFixed();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeForWire);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, v]) => [key, serializeForWire(v)]),
    );
  }
  return value;
}

/**
 * Handler trả về { data, message } để interceptor bọc thành ApiResponse<T>
 * chuẩn (giống Wokki.Common.Utils.ApiResponse<T> ở stack .NET tham chiếu, viết
 * lại cho NestJS). message mặc định "OK" nếu handler không tự đặt.
 */
export interface HandlerPayload<T> {
  data: T;
  message?: AppMessage;
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((payload: HandlerPayload<unknown> | undefined) => {
        const data = payload && "data" in payload ? payload.data : payload;
        const message = payload && "message" in payload && payload.message ? payload.message : DEFAULT_OK;
        return successResponse(serializeForWire(data), message);
      }),
    );
  }
}

const DEFAULT_OK: AppMessage = { code: "OK", text: "Thành công" };
