import { NextResponse } from 'next/server';
import { incrementClicks, getBid } from '@/lib/db';

// Naive per-instance rate limit: max 10 clicks per id per 60s
const clickLog = new Map<string, { count: number; reset: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const bid = await getBid(id);
    if (!bid) {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }

    // Rate limit
    const now = Date.now();
    const entry = clickLog.get(id);
    if (!entry || now > entry.reset) {
      clickLog.set(id, { count: 1, reset: now + WINDOW_MS });
    } else if (entry.count >= MAX_PER_WINDOW) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    } else {
      entry.count += 1;
    }

    const clicks = await incrementClicks(id);
    return NextResponse.json({ success: true, clicks });
  } catch (e: any) {
    if (e?.message === 'Bid not found') {
      return NextResponse.json({ error: 'Bid not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to increment clicks' }, { status: 500 });
  }
}
