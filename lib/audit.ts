import { prisma } from "@/lib/db";
import type { AuthedUser } from "@/lib/userAuth";

type LogAuditInput = {
  actor: AuthedUser | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
};

/**
 * Records an admin/manager action after it succeeds. Never called before
 * the mutation, and any failure here is swallowed (logged to the server
 * console, not thrown) — a broken audit write must never fail the action
 * it's describing.
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.actor?.id ?? null,
        actorName: input.actor?.name ?? "Unknown",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary,
        before: input.before === undefined ? undefined : (input.before as object),
        after: input.after === undefined ? undefined : (input.after as object),
      },
    });
  } catch (error) {
    console.error("logAudit failed:", error);
  }
}
