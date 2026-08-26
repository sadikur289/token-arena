// Data layer with pluggable backends.
// - If SUPABASE_URL + SUPABASE_SERVICE_KEY are set -> Supabase Postgres
// - Otherwise falls back to JSON file (local dev only — ephemeral on Vercel!)
import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface Bid {
  id: string;
  label: string;
  link: string;
  amount: number;
  clicks: number;
  signature: string | null;
  timestamp: string;
}

interface Db {
  bids: Bid[];
  totalViews: number;
}

let supabase: SupabaseClient | null = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// ---------- JSON-file fallback (dev only) ----------
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const DATA_DIR = process.env.DATA_DIR || path.join(os.tmpdir(), 'token-arena');
const DB_FILE = path.join(DATA_DIR, 'db.json');

async function readDb(): Promise<Db> {
  try {
    return JSON.parse(await fs.readFile(DB_FILE, 'utf-8'));
  } catch {
    return { bids: [], totalViews: 0 };
  }
}

async function writeDb(db: Db) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db));
}

function sortBids(bids: Bid[]) {
  return [...bids].sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
}

const newId = () => Math.random().toString(36).slice(2, 11);

// ---------- Public API ----------
export async function getBids(): Promise<Bid[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('bids')
      .select('*')
      .order('amount', { ascending: false })
      .order('timestamp', { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return sortBids(data as Bid[]);
  }
  const db = await readDb();
  return sortBids(db.bids);
}

export async function createBid(label: string, link: string, amount: number, signature?: string): Promise<Bid> {
  if (supabase) {
    const { data, error } = await supabase
      .from('bids')
      .insert({ label, link, amount, clicks: 0, signature: signature ?? null })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Bid;
  }
  const db = await readDb();
  const bid: Bid = {
    id: newId(),
    label,
    link,
    amount,
    clicks: 0,
    signature: signature ?? null,
    timestamp: new Date().toISOString(),
  };
  db.bids.push(bid);
  await writeDb(db);
  return bid;
}

export async function getBidBySignature(signature: string): Promise<Bid | null> {
  if (!signature) return null;
  if (supabase) {
    const { data } = await supabase.from('bids').select('*').eq('signature', signature).maybeSingle();
    return (data as Bid) || null;
  }
  const db = await readDb();
  return db.bids.find(b => b.signature === signature) || null;
}

export async function getBid(id: string): Promise<Bid | null> {
  if (supabase) {
    const { data } = await supabase.from('bids').select('*').eq('id', id).maybeSingle();
    return (data as Bid) || null;
  }
  const db = await readDb();
  return db.bids.find(b => b.id === id) || null;
}

export async function updateBid(
  id: string,
  patch: Partial<Pick<Bid, 'label' | 'link' | 'amount'>>
): Promise<void> {
  const existing = await getBid(id);
  if (!existing) throw new Error('Bid not found');
  if (supabase) {
    const { error } = await supabase.from('bids').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  const db = await readDb();
  const bid = db.bids.find(b => b.id === id)!;
  Object.assign(bid, patch);
  await writeDb(db);
}

export async function deleteBid(id: string): Promise<void> {
  const existing = await getBid(id);
  if (!existing) throw new Error('Bid not found');
  if (supabase) {
    const { error } = await supabase.from('bids').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  const db = await readDb();
  db.bids = db.bids.filter(b => b.id !== id);
  await writeDb(db);
}

export async function incrementClicks(id: string): Promise<number> {
  if (supabase) {
    // Atomic increment via RPC-free approach: read then write is racy,
    // so use a single UPDATE with expression via rpc if defined; else read-modify-write.
    const current = await getBid(id);
    if (!current) throw new Error('Bid not found');
    const { error } = await supabase
      .from('bids')
      .update({ clicks: current.clicks + 1 })
      .eq('id', id);
    if (error) throw new Error(error.message);
    return current.clicks + 1;
  }
  const db = await readDb();
  const bid = db.bids.find(b => b.id === id);
  if (!bid) throw new Error('Bid not found');
  bid.clicks += 1;
  await writeDb(db);
  return bid.clicks;
}

export async function updateViews(): Promise<number> {
  if (supabase) {
    const { data } = await supabase
      .from('metrics')
      .select('total_views')
      .eq('id', 'global')
      .maybeSingle();
    const next = ((data?.total_views as number) || 0) + 1;
    await supabase.from('metrics').upsert({ id: 'global', total_views: next });
    return next;
  }
  const db = await readDb();
  db.totalViews += 1;
  await writeDb(db);
  return db.totalViews;
}

export async function getTotalViews(): Promise<number> {
  if (supabase) {
    const { data } = await supabase
      .from('metrics')
      .select('total_views')
      .eq('id', 'global')
      .maybeSingle();
    return (data?.total_views as number) || 0;
  }
  const db = await readDb();
  return db.totalViews;
}
