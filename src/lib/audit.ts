import type { Request } from 'express';
import type { AuditAction, PrismaClient } from '@prisma/client';

interface AuditInput {
  action: AuditAction;
  userId?: string | null;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Fire-and-forget audit write. Never blocks the request handler.
 * Failures are logged but never surface to the caller — audit gaps
 * are recoverable, but a 500 on the write path is not.
 */
export function writeAudit(
  prisma: PrismaClient,
  req: Request,
  input: AuditInput,
): void {
  const requestId = (req as Request & { requestId?: string }).requestId;
  const ip = req.ip;
  const userAgent = req.headers['user-agent']?.slice(0, 500);

  prisma.auditLog
    .create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        ip,
        userAgent,
        requestId,
        meta: input.meta as never,
      },
    })
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[audit] write failed', { action: input.action, err });
    });
}
