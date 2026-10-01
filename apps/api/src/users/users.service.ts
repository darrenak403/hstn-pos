import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreateUserRequest, UpdateUserRequest } from "@seafood-pos/schemas";
import { createBusinessAudit } from "../audit-log/audit-transaction";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService) {}

  list() {
    return this.prisma.user.findMany({
      select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
    });
  }

  async create(input: CreateUserRequest, actorId: string) {
    const passwordHash = await this.passwords.hash(input.password);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { username: input.username, passwordHash, displayName: input.displayName, role: input.role },
        select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
      });
      await createBusinessAudit(tx, {
        actorId,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user.id,
        metadata: { username: user.username, role: user.role },
      });
      return user;
    });
  }

  update(id: string, input: UpdateUserRequest, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(722001)`);
      const current = await tx.user.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Không tìm thấy người dùng");
      if (current.id === actorId && input.role !== "ADMIN") {
        throw new ConflictException("Bạn không thể tự hạ quyền Quản lý của tài khoản đang sử dụng");
      }
      if (current.isActive && current.role === "ADMIN" && input.role !== "ADMIN") {
        const otherAdmins = await tx.user.count({ where: { id: { not: id }, role: "ADMIN", isActive: true } });
        if (otherAdmins === 0) throw new ConflictException("Cần giữ ít nhất một Quản lý đang hoạt động");
      }
      const user = await tx.user.update({
        where: { id },
        data: { displayName: input.displayName, role: input.role },
        select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
      });
      await createBusinessAudit(tx, {
        actorId,
        action: "USER_UPDATED",
        entityType: "User",
        entityId: id,
        metadata: { previousRole: current.role, role: user.role },
      });
      return user;
    });
  }

  setActive(id: string, isActive: boolean, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(722001)`);
      const current = await tx.user.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Không tìm thấy người dùng");
      if (current.id === actorId && !isActive) throw new ConflictException("Bạn không thể tự khóa tài khoản đang sử dụng");
      if (current.isActive && current.role === "ADMIN" && !isActive) {
        const otherAdmins = await tx.user.count({ where: { id: { not: id }, role: "ADMIN", isActive: true } });
        if (otherAdmins === 0) throw new ConflictException("Cần giữ ít nhất một Quản lý đang hoạt động");
      }
      const user = await tx.user.update({
        where: { id },
        data: { isActive },
        select: { id: true, username: true, displayName: true, role: true, isActive: true, createdAt: true },
      });
      if (!isActive) {
        await tx.refreshToken.updateMany({
          where: { userId: id },
          data: { revokedAt: new Date(), revokedReason: "USER_INACTIVE" },
        });
      }
      await createBusinessAudit(tx, {
        actorId,
        action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
        entityType: "User",
        entityId: id,
        metadata: { username: user.username },
      });
      return user;
    });
  }

  async resetPassword(id: string, password: string, actorId: string) {
    const passwordHash = await this.passwords.hash(password);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { id: true, username: true } });
      if (!user) throw new NotFoundException("Không tìm thấy người dùng");
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date(), revokedReason: "ADMIN_REVOKED" },
      });
      await createBusinessAudit(tx, {
        actorId,
        action: "USER_PASSWORD_RESET",
        entityType: "User",
        entityId: id,
        metadata: { username: user.username, allSessionsRevoked: true },
      });
      return { id, username: user.username, sessionsRevoked: true };
    });
  }
}
