import { NextResponse } from 'next/server';
import { deleteBid, updateBid } from '@/lib/db';
import { getTokenFromRequest, unauthorized, verifyAdminToken } from '@/lib/admin-auth';

const ALLOWED_FIELDS = ['label', 'link', 'amount'] as const;

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminToken(getTokenFromRequest(request))) return unauthorized();
  try {
    const { id } = await params;
    await deleteBid(id);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    // Distinguish "not found" from real errors
    if (e?.message === 'Bid not found') {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to delete bid' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdminToken(getTokenFromRequest(request))) return unauthorized();
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    // Strict field whitelist + validation
    const update: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
      if (field in body) {
        if (field === 'label' && typeof body.label === 'string' && body.label.trim()) {
          update.label = body.label.trim().slice(0, 60);
        } else if (field === 'link') {
          const link = String(body.link ?? '');
          if (!/^https?:\/\/.+/i.test(link)) {
            return NextResponse.json({ error: 'link must be http(s) URL' }, { status: 400 });
          }
          update.link = link;
        } else if (field === 'amount') {
          const amount = Number(body.amount);
          if (!Number.isFinite(amount) || amount < 0) {
            return NextResponse.json({ error: 'amount must be a non-negative number' }, { status: 400 });
          }
          update.amount = amount;
        }
      }
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    await updateBid(id, update as any);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.message === 'Bid not found') {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to update bid' }, { status: 500 });
  }
}
