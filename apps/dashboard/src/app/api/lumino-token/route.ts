import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';

export async function GET() {
  const secret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: 'dashboard-admin',
    role: 'admin',
    locale: 'en-US',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return NextResponse.json({ token: `${headerB64}.${payloadB64}.${signature}` });
}
