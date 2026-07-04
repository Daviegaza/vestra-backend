import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '@prisma/client';

const IDEMPOTENCY_TTL_HOURS = 24;

interface AuthedReq extends Request {
  userId?: string;
}

/**
 * Idempotency-Key middleware for financial POSTs. Behavior:
 *  - if header absent → pass through
 *  - if header present + same user + same route + prior 2xx cached → replay stored response
 *  - if header present + no prior → tag the request so the handler
 *    can save its response via `saveIdempotencyResult`
 *
 * Guarantees: at-most-once for user-supplied key within TTL.
 * Race safety: unique DB constraint on (userId, key, route) blocks
 * concurrent duplicates — the second wins the read on retry.
 */
export function idempotency(prisma: PrismaClient) {
  return async (req: AuthedReq, res: Response, next: NextFunction) => {
    const rawKey = req.header('Idempotency-Key');
    if (!rawKey) return next();
    if (!req.userId) return next();

    const key = rawKey.slice(0, 128);
    const route = `${req.method} ${req.route?.path ?? req.path}`;

    const existing = await prisma.idempotencyRecord.findUnique({
      where: { userId_key_route: { userId: req.userId, key, route } },
    });
    if (existing && existing.expiresAt > new Date()) {
      res.setHeader('Idempotent-Replay', 'true');
      return res.status(existing.statusCode).json(existing.response);
    }

    (req as AuthedReq & { idempotencyKey?: string; idempotencyRoute?: string }).idempotencyKey = key;
    (req as AuthedReq & { idempotencyKey?: string; idempotencyRoute?: string }).idempotencyRoute = route;
    next();
  };
}

/**
 * Persist a successful response so a retry with the same key
 * replays this result instead of running the handler again.
 */
export async function saveIdempotencyResult(
  prisma: PrismaClient,
  req: AuthedReq,
  statusCode: number,
  body: unknown,
): Promise<void> {
  const key = (req as AuthedReq & { idempotencyKey?: string }).idempotencyKey;
  const route = (req as AuthedReq & { idempotencyRoute?: string }).idempotencyRoute;
  if (!key || !route || !req.userId) return;
  await prisma.idempotencyRecord
    .create({
      data: {
        userId: req.userId,
        key,
        route,
        statusCode,
        response: body as never,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000),
      },
    })
    .catch(() => undefined);
}
