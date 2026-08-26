import { NextResponse } from 'next/server';
import { createAdminToken, requireAdminSecrets, unauthorized, verifyAdminToken, getTokenFromRequest } from '@/lib/admin-auth';

/**
 * POST /api/admin/login   { password }  -> { token }
 * GET  /api/admin/login (Bearer)       -> validate existing token
 */
export async function POST(request: Request) {
  try {
    requireAdminSecrets();
    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';

    // Constant-time-ish comparison
    const expected = process.env.ADMIN_PASSWORD as string;
    if (password.length !== expected.length || !timingSafeEq(password, expected)) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
    return NextResponse.json({ token: createAdminToken() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server misconfigured' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!verifyAdminToken(getTokenFromRequest(request))) return unauthorized();
  return NextResponse.json({ valid: true });
}

function timingSafeEq(a: string, b: string): boolean {
  const crypto = require('crypto');
  const ba = crypto.createHash('sha256').update(a).digest();
  const bb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ba, bb);
}
