"use client";

import React, { useState, useEffect } from 'react';
import { usePhantom, useModal, useAccounts, useDisconnect, useSolana } from '@phantom/react-sdk';
import { AddressType } from '@phantom/browser-sdk';
import { Connection, PublicKey, VersionedTransaction, TransactionMessage, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

interface Bid {
  id: string;
  label: string;
  link: string;
  amount: number;
  timestamp: number;
  clicks: number;
}

const SOL_PRICE_USD = Number(process.env.NEXT_PUBLIC_SOL_PRICE_USD || '150');

export default function TokenArena() {
  const [bids, setBids] = useState<Bid[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [viewMode, setViewMode] = useState<'alltime' | 'today'>('alltime');
  const [formData, setFormData] = useState({ label: '', link: '', amount: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [totalViews, setTotalViews] = useState(0);
  const [activeViewers, setActiveViewers] = useState(1);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);

  const { open } = useModal();
  const accounts = useAccounts();
  const { disconnect } = useDisconnect();
  const { solana } = useSolana();
  const { isClient } = usePhantom();

  // Hooks are only valid once the SDK provider has mounted on the client.
  const sdkReady = isClient;

  // accounts is WalletAddress[] | null: [{addressType, address}]
  const solanaAddress: string | null =
    accounts?.find(a => a.addressType === AddressType.solana)?.address ?? null;

  const connected = !!solanaAddress;

  useEffect(() => {
    fetchBids();
    const activeInterval = setInterval(() => {
      setActiveViewers(prev => Math.max(1, prev + (Math.random() > 0.5 ? 1 : -1)));
    }, 5000);
    return () => clearInterval(activeInterval);
  }, []);

  async function fetchBids() {
    try {
      const res = await fetch('/api/bids');
      if (!res.ok) return;
      const text = await res.text();
      if (!text) return;
      const data = JSON.parse(text);
      if (data.bids) setBids(data.bids);
    } catch (e) {
      console.error('Failed to fetch bids', e);
    }
  }

  function showToast(msg: string, kind: 'ok' | 'err') {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 5000);
  }

  const sortBids = (data: Bid[]) => [...data].sort((a, b) => {
    if (b.amount !== a.amount) return b.amount - a.amount;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });

  const allTimeBids = sortBids(bids);
  const todayBids = sortBids(bids.filter(b => new Date(b.timestamp).toDateString() === new Date().toDateString()));
  const currentList = viewMode === 'alltime' ? allTimeBids : todayBids;
  const highestBid = allTimeBids.length > 0 ? allTimeBids[0].amount : 0;

  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || !solanaAddress) {
      open(); // opens Phantom Connect modal
      return;
    }

    setIsProcessing(true);
    try {
      const amountUSD = parseFloat(formData.amount);
      const amountSOL = amountUSD / SOL_PRICE_USD;

      const treasury = process.env.NEXT_PUBLIC_TREASURY_WALLET;
      if (!treasury) {
        showToast('Bidding is not configured yet.', 'err');
        setIsProcessing(false);
        return;
      }

      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC || 'https://api.devnet.solana.com'
      );
      const { blockhash } = await connection.getLatestBlockhash();
      const from = new PublicKey(solanaAddress);
      const to = new PublicKey(treasury);

      const transaction = new VersionedTransaction(
        new TransactionMessage({
          payerKey: from,
          recentBlockhash: blockhash,
          instructions: [
            SystemProgram.transfer({
              fromPubkey: from,
              toPubkey: to,
              lamports: Math.round(amountSOL * LAMPORTS_PER_SOL),
            }),
          ],
        }).compileToV0Message()
      );

      // Sign & send via Phantom Connect SDK chain interface
      const sig = await solana.signAndSendTransaction(transaction);
      const signature = typeof sig === 'string' ? sig : sig.signature;

      // Confirm on-chain
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      if (confirmation.value.err) {
        throw new Error('Transaction failed on-chain');
      }

      // Backend verifies the tx before accepting bid
      const verifyRes = await fetch('/api/bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: formData.label,
          link: formData.link,
          amount: amountUSD,
          signature,
        }),
      });

      if (verifyRes.ok) {
        showToast('Bid verified and accepted!', 'ok');
        setFormData({ label: '', link: '', amount: '' });
        setShowModal(false);
        fetchBids();
      } else {
        let msg = `Verification failed (HTTP ${verifyRes.status})`;
        try {
          const j = await verifyRes.json();
          if (j.error) msg = j.error;
        } catch {}
        showToast(msg, 'err');
      }
    } catch (err: any) {
      console.error('Payment failed', err);
      showToast(err?.message || 'Payment failed or was cancelled.', 'err');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProjectClick = async (id: string, link: string) => {
    try { await fetch(`/api/bids/${id}`, { method: 'POST' }); } catch {}
    if (/^https?:\/\//i.test(link)) {
      window.open(link, '_blank', 'noopener,noreferrer');
    }
  };

  const shortKey = solanaAddress
    ? `${solanaAddress.slice(0, 4)}...${solanaAddress.slice(-4)}`
    : null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans selection:bg-zinc-700">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] px-5 py-3 rounded-full text-sm font-bold shadow-2xl border ${
            toast.kind === 'ok'
              ? 'bg-green-950/90 text-green-300 border-green-700'
              : 'bg-red-950/90 text-red-300 border-red-700'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <header className="py-8 px-4 border-b border-zinc-800 bg-[#0f0f0f] flex flex-col items-center justify-center">
        <div className="w-full flex justify-between items-center max-w-5xl mb-8">
          <div className="flex items-center gap-2 text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-xs font-mono">{activeViewers.toLocaleString()} online</span>
          </div>
          <button
            onClick={() => (connected ? disconnect() : open())}
            className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-bold hover:bg-zinc-700 transition-all"
          >
            {connected && shortKey ? `${shortKey} • Disconnect` : 'Connect Wallet'}
          </button>
        </div>

        <h1 className="text-3xl font-bold tracking-tighter mb-6">
          outbid.<span className="text-zinc-500">arena</span>
        </h1>

        <div className="bg-zinc-900 p-1 rounded-full flex gap-1 border border-zinc-800 mb-8">
          {(['alltime', 'today'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${viewMode === mode ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {mode === 'alltime' ? 'All-time' : 'Today'}
            </button>
          ))}
        </div>

        <div className="text-center mb-10">
          <div className="text-2xl font-medium text-zinc-400 mb-2">
            Claim #1 for{' '}
            <span className="text-white font-bold text-3xl ml-2">${(highestBid + 1).toLocaleString()}</span>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-10 py-4 bg-zinc-100 text-black font-black uppercase text-sm tracking-widest rounded-full hover:bg-white transition-all active:scale-95"
          >
            Outbid
          </button>
          <p className="mt-4 text-zinc-500 text-[11px] max-w-xs mx-auto leading-relaxed">
            New spots start at $5. Paying less than the #1 price still puts you on the board.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto py-12 px-4">
        <div className="bg-[#0f0f0f] border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-800 bg-zinc-900/50 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            <div className="col-span-2">Rank</div>
            <div className="col-span-7">Project</div>
            <div className="col-span-3 text-right">Bid</div>
          </div>

          <div className="divide-y divide-zinc-800">
            {currentList.length > 0 ? (
              currentList.map((bid, index) => (
                <div key={bid.id} className="grid grid-cols-12 gap-4 p-5 items-center hover:bg-zinc-800/30 transition-colors group">
                  <div className="col-span-2 font-mono text-zinc-500">#{index + 1}</div>
                  <div className="col-span-7 flex flex-col">
                    <button
                      onClick={() => handleProjectClick(bid.id, bid.link)}
                      className="text-lg font-semibold text-left hover:text-zinc-300 transition-colors"
                    >
                      {bid.label}
                    </button>
                    <div className="text-[10px] text-zinc-600 font-mono uppercase mt-1">
                      {(bid.clicks ?? 0).toLocaleString()} clicks
                    </div>
                  </div>
                  <div className="col-span-3 text-right font-mono font-bold text-zinc-300">
                    ${Number(bid.amount).toLocaleString()}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-10 text-center text-zinc-600 italic">No bids yet for this period.</div>
            )}
          </div>
        </div>
      </main>

      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div
            className="bg-[#0f0f0f] border border-zinc-800 p-8 rounded-2xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto relative z-[10000]"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold uppercase tracking-tight mb-6">Enter the Arena</h2>
            {!connected && (
              <div className="mb-6 space-y-3">
                <p className="text-xs text-yellow-500 text-center font-mono uppercase">Connect your wallet to bid</p>
                <button
                  onClick={() => open()}
                  className="w-full py-3 bg-[#4C469D] text-white font-bold uppercase text-xs rounded-lg hover:opacity-90"
                >
                  Sign in with Google / Apple / Phantom
                </button>
                <p className="text-[10px] text-zinc-600 text-center">
                  Sign in with Google or Apple to get an instant wallet — or connect your existing Phantom.
                </p>
              </div>
            )}

            <form onSubmit={handleBid} className="space-y-5">
              <div className="bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 text-center">
                <p className="text-xs text-zinc-400 font-mono">
                  Estimated SOL:{' '}
                  <span className="text-white font-bold">
                    {(parseFloat(formData.amount || '0') / SOL_PRICE_USD).toFixed(4)} SOL
                  </span>
                </p>
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Project Label</label>
                <input
                  required
                  maxLength={60}
                  className="w-full p-3 bg-black border border-zinc-800 rounded focus:border-zinc-500 outline-none transition-colors text-white"
                  placeholder="$TOKEN"
                  value={formData.label}
                  onChange={e => setFormData({ ...formData, label: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Product URL</label>
                <input
                  required
                  type="url"
                  className="w-full p-3 bg-black border border-zinc-800 rounded focus:border-zinc-500 outline-none transition-colors text-white"
                  placeholder="https://..."
                  value={formData.link}
                  onChange={e => setFormData({ ...formData, link: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500 mb-1">Bid Amount (USD)</label>
                <input
                  required
                  type="number"
                  min="5"
                  step="any"
                  className="w-full p-3 bg-black border border-zinc-800 rounded focus:border-zinc-500 outline-none transition-colors text-white"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 text-xs font-bold text-zinc-500 hover:text-white transition-colors uppercase"
                >
                  Cancel
                </button>
                <button
                  disabled={isProcessing || !connected}
                  type="submit"
                  className="flex-1 py-3 bg-white text-black font-bold uppercase text-xs rounded hover:bg-zinc-200 transition-colors disabled:bg-zinc-600 disabled:text-zinc-400 disabled:cursor-not-allowed"
                >
                  {isProcessing ? 'Processing…' : connected ? 'Outbid' : 'Connect First'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
