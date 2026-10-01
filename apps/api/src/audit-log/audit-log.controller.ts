import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuditLogQuerySchema, type AuditLogQuery } from "@seafood-pos/schemas";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuditLogService } from "./audit-log.service";

@Controller("api/v1/audit-log")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN")
export class AuditLogController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  async list(@Query(new ZodValidationPipe(AuditLogQuerySchema)) query: AuditLogQuery) {
    return { data: await this.auditLog.list(query), message: { code: "AUDIT_LOG", text: "Nhật ký hoạt động" } };
  }
}
