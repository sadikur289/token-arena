// Server-side admin authentication.
// ADMIN_PASSWORD lives only in env; clients exchange it for a short-lived
// signed token, which every /api/admin/* route verifies.
import crypto from 'crypto';
import { NextResponse } from 'next/server';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error('ADMIN_SESSION_SECRET not configured');
  return secret;
}

export function requireAdminSecrets() {
  if (!process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD not configured');
  }
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/** Create a signed token: <expiresAtMs>.<hmac> */
export function createAdminToken(): string {
  requireAdminSecrets();
  const expires = Date.now() + TOKEN_TTL_MS;
  return `${expires}.${sign(String(expires))}`;
}

/** Verify token signature + expiry. Constant-time compare on the MAC. */
export function verifyAdminToken(token: string | null): boolean {
  if (!token) return false;
  const [expiresRaw, mac] = token.split('.');
  const expires = Number(expiresRaw);
  if (!expiresRaw || !mac || !Number.isFinite(expires)) return false;
  if (Date.now() > expires) return false;

  const expected = sign(expiresRaw);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Extract bearer token from a Request. */
export function getTokenFromRequest(request: Request): string | null {
  const header = request.headers.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  return null;
}

/** Standard 401 response. */
export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
