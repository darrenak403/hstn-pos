import { Prisma } from "@prisma/client";
import { redact } from "./redact";

export interface BusinessAuditInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

export async function createBusinessAudit(
  tx: Prisma.TransactionClient,
  input: BusinessAuditInput,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      category: "BUSINESS",
      action: input.action,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ? (redact(input.metadata) as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
  });
}
