import { NextResponse } from 'next/server';
import { getBids } from '@/lib/db';
import { getTokenFromRequest, unauthorized, verifyAdminToken } from '@/lib/admin-auth';

export async function GET(request: Request) {
  if (!verifyAdminToken(getTokenFromRequest(request))) return unauthorized();
  try {
    const bids = await getBids();
    return NextResponse.json(bids);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch bids' }, { status: 500 });
  }
}
