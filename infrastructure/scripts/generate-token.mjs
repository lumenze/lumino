#!/usr/bin/env node
/**
 * Lumino — Generate JWT tokens for testing
 *
 * Usage:
 *   node generate-token.mjs --role author --secret YOUR_JWT_SECRET
 *   node generate-token.mjs --role customer --secret YOUR_JWT_SECRET
 *   node generate-token.mjs --role admin --secret YOUR_JWT_SECRET
 */
import { createHmac } from 'node:crypto';

const args = process.argv.slice(2);
const role = args[args.indexOf('--role') + 1] || 'customer';
const secret = args[args.indexOf('--secret') + 1];

if (!secret) {
  console.error('Usage: node generate-token.mjs --role <customer|author|admin> --secret <JWT_SECRET>');
  process.exit(1);
}

const header = { alg: 'HS256', typ: 'JWT' };

const payload = {
  sub: `test-${role}-${Date.now()}`,
  role,
  locale: 'en-US',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
};

const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const headerB64 = encode(header);
const payloadB64 = encode(payload);
const signature = createHmac('sha256', secret)
  .update(`${headerB64}.${payloadB64}`)
  .digest('base64url');

const token = `${headerB64}.${payloadB64}.${signature}`;

console.log(`\nRole: ${role}`);
console.log(`Expires: ${new Date(payload.exp * 1000).toISOString()}`);
console.log(`User ID: ${payload.sub}\n`);
console.log(token);
