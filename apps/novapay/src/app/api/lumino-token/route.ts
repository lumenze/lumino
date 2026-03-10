import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * Dev-only endpoint: generates a JWT for Lumino SDK authentication.
 * Supports ?role=author|customer for demo persona switching.
 * In production, the host app's real auth system provides this.
 */

export const dynamic = 'force-dynamic';

const PERSONAS = {
  author: { sub: 'user-alex-chen', role: 'author', name: 'Alex Chen' },
  customer: { sub: 'user-sarah-johnson', role: 'customer', name: 'Sarah Johnson' },
  admin: { sub: 'user-admin-1', role: 'admin', name: 'Admin' },
} as const;

export async function GET(request: NextRequest) {
  const secret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
  const role = request.nextUrl.searchParams.get('role') ?? 'customer';
  const persona = PERSONAS[role as keyof typeof PERSONAS] ?? PERSONAS.customer;

  const header = { alg: 'HS256', typ: 'JWT' };

  const payload = {
    sub: persona.sub,
    role: persona.role,
    locale: 'en-US',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  const token = `${headerB64}.${payloadB64}.${signature}`;

  return NextResponse.json({ token, persona: { name: persona.name, role: persona.role } });
}
