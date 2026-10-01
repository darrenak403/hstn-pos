import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { CreateUserRequestSchema, ResetUserPasswordRequestSchema, UpdateUserRequestSchema, UserStatusRequestSchema, type CreateUserRequest, type UpdateUserRequest } from "@seafood-pos/schemas";
import { CurrentUser, type CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { UsersService } from "./users.service";

@Controller("api/v1/users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async list() {
    return { data: await this.users.list(), message: { code: "USERS", text: "Danh sách người dùng" } };
  }

  @Post()
  async create(@Body(new ZodValidationPipe(CreateUserRequestSchema)) input: CreateUserRequest, @CurrentUser() actor: CurrentUserPayload) {
    return { data: await this.users.create(input, actor.id), message: { code: "USER_CREATED", text: "Đã tạo người dùng" } };
  }

  @Put(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateUserRequestSchema)) input: UpdateUserRequest,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return { data: await this.users.update(id, input, actor.id), message: { code: "USER_UPDATED", text: "Đã cập nhật người dùng" } };
  }

  @Patch(":id/active")
  async setActive(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UserStatusRequestSchema)) input: { isActive: boolean },
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return { data: await this.users.setActive(id, input.isActive, actor.id), message: { code: "USER_STATUS_UPDATED", text: "Đã cập nhật trạng thái người dùng" } };
  }

  @Post(":id/reset-password")
  async resetPassword(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ResetUserPasswordRequestSchema)) input: { password: string },
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return { data: await this.users.resetPassword(id, input.password, actor.id), message: { code: "PASSWORD_RESET", text: "Đã đặt lại mật khẩu và thu hồi phiên cũ" } };
  }
}
