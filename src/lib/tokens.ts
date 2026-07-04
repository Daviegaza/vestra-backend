import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';

const REFRESH_TOKEN_TTL_DAYS = 30;
const PASSWORD_RESET_TTL_MINUTES = 30;

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function randomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export interface IssuedRefreshToken {
  id: string;
  token: string;
  expiresAt: Date;
}

/**
 * Mint a refresh token. Stores only the hash; the raw token is
 * returned once to the caller (client) and can never be reconstructed.
 */
export async function issueRefreshToken(
  prisma: PrismaClient,
  userId: string,
  meta: { userAgent?: string; ip?: string; parentId?: string } = {},
): Promise<IssuedRefreshToken> {
  const token = randomToken();
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const row = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 500),
      ip: meta.ip,
      parentId: meta.parentId,
    },
  });
  return { id: row.id, token, expiresAt };
}

/**
 * Verify + rotate. Returns the userId if the token is live, and
 * issues a new refresh token in a single transaction. Detects
 * replay: if the token has already been used, revokes the whole
 * chain (all descendants of the parent) — a stolen token should
 * trigger a hard sign-out.
 */
export async function rotateRefreshToken(
  prisma: PrismaClient,
  rawToken: string,
  meta: { userAgent?: string; ip?: string },
): Promise<{ userId: string; issued: IssuedRefreshToken } | null> {
  const tokenHash = sha256(rawToken);
  const row = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt < new Date()) return null;

  if (row.usedAt) {
    // Replay: revoke this user's whole token pool as a precaution.
    await prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return null;
  }

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: row.id },
      data: { usedAt: now, revokedAt: now },
    });
    const token = randomToken();
    const issued = await tx.refreshToken.create({
      data: {
        userId: row.userId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
        parentId: row.id,
        userAgent: meta.userAgent?.slice(0, 500),
        ip: meta.ip,
      },
    });
    return {
      userId: row.userId,
      issued: { id: issued.id, token, expiresAt: issued.expiresAt },
    };
  });
}

export async function revokeRefreshToken(
  prisma: PrismaClient,
  rawToken: string,
): Promise<void> {
  const tokenHash = sha256(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllRefreshTokens(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export interface IssuedPasswordReset {
  token: string;
  expiresAt: Date;
}

export async function issuePasswordReset(
  prisma: PrismaClient,
  userId: string,
): Promise<IssuedPasswordReset> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  await prisma.passwordReset.create({
    data: { userId, tokenHash: sha256(token), expiresAt },
  });
  return { token, expiresAt };
}

export async function consumePasswordReset(
  prisma: PrismaClient,
  rawToken: string,
): Promise<string | null> {
  const tokenHash = sha256(rawToken);
  const row = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt < new Date()) return null;
  await prisma.passwordReset.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  return row.userId;
}
