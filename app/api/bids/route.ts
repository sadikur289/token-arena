import { NextResponse } from 'next/server';
import { getBids, getTotalViews, updateViews, createBid, getBidBySignature } from '@/lib/db';
import { Connection, PublicKey, LAMPORTS_PER_SOL, ParsedTransactionWithMeta } from '@solana/web3.js';

// ---- Config (fail fast if missing) ----
function requiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const MIN_BID_USD = Number(process.env.MIN_BID_USD || '5');
const SOL_PRICE_USD = Number(process.env.SOL_PRICE_USD || '150');
const FEE_LAMPORTS = BigInt(5000 * 2); // allow up to ~2 tx fees of slack

export async function GET() {
  try {
    const bids = await getBids();
    const totalViews = await getTotalViews();
    // Fire-and-forget view increment; don't fail the read if it errors
    updateViews().catch(() => {});
    return NextResponse.json({ bids, totalViews });
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const label = String(body.label ?? '').trim().slice(0, 60);
    const link = String(body.link ?? '').trim();
    const amountUSD = Number(body.amount);
    const signature = String(body.signature ?? '').trim();

    // --- Input validation (server-side authority) ---
    if (!label) return NextResponse.json({ error: 'label is required' }, { status: 400 });
    if (!/^https?:\/\/.+/i.test(link)) {
      return NextResponse.json({ error: 'link must be an http(s) URL' }, { status: 400 });
    }
    if (!Number.isFinite(amountUSD) || amountUSD < MIN_BID_USD) {
      return NextResponse.json({ error: `amount must be >= $${MIN_BID_USD}` }, { status: 400 });
    }
    if (!signature || signature.length < 32 || signature.length > 128 || !/^[A-Za-z0-9_-]+$/.test(signature)) {
      return NextResponse.json({ error: 'invalid transaction signature format' }, { status: 400 });
    }

    // --- Replay protection: one signature = one bid ---
    const existing = await getBidBySignature(signature);
    if (existing) {
      return NextResponse.json({ error: 'This transaction was already used for a bid' }, { status: 409 });
    }

    // --- On-chain verification ---
    const rpc = process.env.SOLANA_RPC || 'https://api.devnet.solana.com';
    const connection = new Connection(rpc, 'confirmed');

    let tx: ParsedTransactionWithMeta | null;
    try {
      tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });
    } catch (rpcErr) {
      return NextResponse.json({ error: 'Could not look up transaction on Solana' }, { status: 502 });
    }

    if (!tx) {
      return NextResponse.json({ error: 'Transaction not found. Did it finalize?' }, { status: 400 });
    }
    if (tx.meta?.err) {
      return NextResponse.json({ error: 'Transaction failed on-chain' }, { status: 400 });
    }

    // Verify: treasury received lamports >= expected amount.
    const treasuryStr = requiredEnv('TREASURY_WALLET');
    let treasuryPubkey: PublicKey;
    try {
      treasuryPubkey = new PublicKey(treasuryStr);
    } catch {
      return NextResponse.json({ error: 'Server misconfigured: bad treasury address' }, { status: 500 });
    }
    const treasuryExpected = treasuryPubkey.toBase58();

    const accountKeys = tx.transaction.message.accountKeys.map(k =>
      typeof k.pubkey === 'string' ? k.pubkey : k.pubkey.toBase58()
    );
    const treasuryIndex = accountKeys.findIndex(k => k === treasuryExpected);
    if (treasuryIndex === -1) {
      return NextResponse.json(
        { error: 'Treasury wallet is not a participant in this transaction' },
        { status: 400 }
      );
    }

    const preBalances = tx.meta?.preBalances ?? [];
    const postBalances = tx.meta?.postBalances ?? [];
    const gained = BigInt(postBalances[treasuryIndex]) - BigInt(preBalances[treasuryIndex]);

    const minLamports =
      BigInt(Math.ceil((amountUSD / SOL_PRICE_USD) * LAMPORTS_PER_SOL)) - FEE_LAMPORTS;

    if (gained <= 0n) {
      return NextResponse.json(
        { error: 'No funds were transferred to the treasury in this transaction' },
        { status: 400 }
      );
    }
    if (gained < minLamports) {
      const paidSOL = Number(gained) / LAMPORTS_PER_SOL;
      return NextResponse.json(
        {
          error: `Underpayment detected. Sent ${paidSOL.toFixed(6)} SOL but bid claims $${amountUSD} (~${(amountUSD / SOL_PRICE_USD).toFixed(6)} SOL).`,
        },
        { status: 402 }
      );
    }

    // Trust the chain: use actual lamports received for the USD value
    const verifiedAmountUSD = Math.min(
      amountUSD,
      (Number(gained) / LAMPORTS_PER_SOL) * SOL_PRICE_USD
    );

    // --- Persist ---
    const bid = await createBid(label, link, verifiedAmountUSD, signature);

    return NextResponse.json({ success: true, bid });
  } catch (e: any) {
    console.error('bid error:', e.message);
    const msg = e.message || '';
    if (msg.startsWith('Missing required env')) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 500 });
  }
}
