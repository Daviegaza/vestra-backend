import type { Request } from 'express';

/**
 * Query-string value normalizer. Express types `req.query.x` as
 * `string | string[] | ParsedQs | ParsedQs[]`. Anything except the
 * first string is treated as absent — Prisma builders never want
 * arrays or nested objects sneaking through.
 */
export function qs(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}

export function qsInt(value: unknown, fallback?: number): number | undefined {
  const s = qs(value);
  if (s === undefined) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function qsBool(value: unknown): boolean | undefined {
  const s = qs(value);
  if (s === undefined) return undefined;
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return undefined;
}

export function qsFrom(req: Request, key: string): string | undefined {
  return qs(req.query[key]);
}
