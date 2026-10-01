import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export interface CurrentUserPayload {
  id: string;
  username: string;
  role: "ADMIN" | "SELLER";
}

interface RequestWithUser {
  user?: CurrentUserPayload;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): CurrentUserPayload => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  if (!request.user) {
    throw new Error("CurrentUser dùng ngoài route có JwtAuthGuard — luôn phải đứng sau guard xác thực");
  }
  return request.user;
});
