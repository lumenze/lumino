import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createHmac } from 'node:crypto';
import { UserRole, type LuminoJwtPayload } from '@lumino/shared';
import { LuminoJwtPayloadSchema } from '@lumino/shared';
import { config } from '../../config/env';

// ── Extend Fastify types ────────────────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    user: LuminoJwtPayload;
  }
}

// ── JWT Decode + Verify ─────────────────────────────────────────────────

function base64UrlDecode(str: string): string {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded, 'base64url').toString('utf-8');
}

function verifyHmac(token: string, secret: string): boolean {
  const [headerB64, payloadB64, signatureB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) return false;

  const expected = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  // Timing-safe comparison
  if (expected.length !== signatureB64.length) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureB64);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

class JwtError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'JwtError';
  }
}

function decodeAndVerifyJwt(token: string): LuminoJwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new JwtError('MALFORMED', 'Token must have 3 parts');
  }

  // Verify signature (HS256 for MVP)
  if (!verifyHmac(token, config.jwt.secret)) {
    throw new JwtError('INVALID_SIGNATURE', 'Token signature verification failed');
  }

  // Decode payload
  const payloadJson = base64UrlDecode(parts[1]!);
  let raw: unknown;
  try {
    raw = JSON.parse(payloadJson);
  } catch {
    throw new JwtError('MALFORMED', 'Token payload is not valid JSON');
  }

  // Validate claim structure with Zod
  const parsed = LuminoJwtPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new JwtError('INVALID_CLAIMS', 'Token claims validation failed');
  }

  const payload = parsed.data as LuminoJwtPayload;

  // Check expiration
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new JwtError('EXPIRED', 'Token has expired');
  }

  return payload;
}

// ── Fastify Hooks ───────────────────────────────────────────────────────

export async function authHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    reply.code(401).send({
      success: false,
      error: { code: 'AUTH_MISSING_TOKEN', message: 'Authorization header required' },
    });
    return;
  }

  try {
    request.user = decodeAndVerifyJwt(header.slice(7));
  } catch (err) {
    const code = err instanceof JwtError ? err.code : 'INVALID_TOKEN';
    const message = err instanceof JwtError ? err.message : 'Invalid token';
    reply.code(401).send({
      success: false,
      error: { code: `AUTH_${code}`, message },
    });
  }
}

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.code(401).send({
        success: false,
        error: { code: 'AUTH_MISSING_TOKEN', message: 'Not authenticated' },
      });
      return;
    }
    if (!roles.includes(request.user.role)) {
      reply.code(403).send({
        success: false,
        error: {
          code: 'AUTH_INSUFFICIENT_ROLE',
          message: `Requires one of: ${roles.join(', ')}`,
        },
      });
    }
  };
}

// ── Module Registration ─────────────────────────────────────────────────

export async function registerAuthModule(app: FastifyInstance): Promise<void> {
  app.decorateRequest('user', null);

  // Token verification endpoint
  app.get('/api/v1/auth/verify', { preHandler: [authHook] }, async (request) => ({
    success: true,
    data: {
      userId: request.user.sub,
      role: request.user.role,
      locale: request.user.locale,
    },
  }));

  app.log.info('Auth module registered');
}
