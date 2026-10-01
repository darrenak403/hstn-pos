import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { redact } from "./redact";
import type { AuditLogQuery } from "@seafood-pos/schemas";

export interface AuditLogInput {
  category: "BUSINESS" | "SECURITY";
  action: string;
  success?: boolean;
  actorId?: string | null;
  actorUsernameAttempted?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
  deviceId?: string | null;
}

// Gộp các lần đăng nhập sai liên tiếp trong cửa sổ này cho cùng (ip, username đã
// gõ) thành MỘT dòng — chặn vector DoS ghi đĩa khi có người spam thử mật khẩu.
const LOGIN_FAILED_COALESCE_WINDOW_MS = 60_000;

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    if (input.action === "LOGIN_FAILED") {
      await this.logLoginFailedCoalesced(input);
      return;
    }

    await this.prisma.auditLog.create({
      data: {
        category: input.category,
        action: input.action,
        success: input.success ?? true,
        actorId: input.actorId ?? null,
        actorUsernameAttempted: input.actorUsernameAttempted ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata
          ? (redact(input.metadata) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        deviceId: input.deviceId ?? null,
      },
    });
  }

  async list(query: AuditLogQuery) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.from || query.to
        ? { createdAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          category: true,
          action: true,
          success: true,
          actorUsernameAttempted: true,
          entityType: true,
          entityId: true,
          metadata: true,
          ip: true,
          deviceId: true,
          createdAt: true,
          actor: { select: { id: true, username: true, displayName: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  private async logLoginFailedCoalesced(input: AuditLogInput): Promise<void> {
    const since = new Date(Date.now() - LOGIN_FAILED_COALESCE_WINDOW_MS);
    const existing = await this.prisma.auditLog.findFirst({
      where: {
        action: "LOGIN_FAILED",
        ip: input.ip ?? null,
        actorUsernameAttempted: input.actorUsernameAttempted ?? null,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      const metadata = (existing.metadata as { attemptCount?: number } | null) ?? {};
      await this.prisma.auditLog.update({
        where: { id: existing.id },
        data: { metadata: { ...metadata, attemptCount: (metadata.attemptCount ?? 1) + 1 } },
      });
      return;
    }

    await this.prisma.auditLog.create({
      data: {
        category: "SECURITY",
        action: "LOGIN_FAILED",
        success: false,
        actorId: input.actorId ?? null,
        actorUsernameAttempted: input.actorUsernameAttempted ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        deviceId: input.deviceId ?? null,
        metadata: { attemptCount: 1 },
      },
    });
  }
}
