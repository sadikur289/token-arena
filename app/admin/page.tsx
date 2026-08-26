"use client";

import React, { useState, useEffect } from 'react';

const TOKEN_KEY = 'ta_admin_token';

export default function AdminPanel() {
  const [bids, setBids] = useState<any[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    // Restore session if token still valid
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      fetch('/api/admin/login', { headers: { Authorization: `Bearer ${saved}` } })
        .then(r => (r.ok ? setToken(saved) : sessionStorage.removeItem(TOKEN_KEY)))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (token) fetchBids();
  }, [token]);

  async function fetchBids() {
    const res = await fetch('/api/admin/bids', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      logout();
      return;
    }
    setBids(await res.json());
  }

  function logout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setBids([]);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        setPassword('');
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch {
      setLoginError('Network error');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to remove this bid?')) return;
    const res = await fetch(`/api/admin/bids/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Delete failed');
    }
    fetchBids();
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-4">
        <div className="bg-[#0f0f0f] border border-zinc-800 p-8 rounded-2xl max-w-md w-full shadow-2xl">
          <h2 className="text-2xl font-bold uppercase tracking-tight mb-6 text-center">Admin Access</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              className="w-full p-3 bg-black border border-zinc-800 rounded focus:border-zinc-500 outline-none transition-colors text-white"
              placeholder="Enter Admin Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
            />
            {loginError && <p className="text-red-500 text-xs">{loginError}</p>}
            <button
              disabled={loggingIn}
              className="w-full py-3 bg-white text-black font-bold uppercase text-xs rounded hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {loggingIn ? 'Signing in…' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <h1 className="text-3xl font-bold uppercase tracking-tighter">
            Admin <span className="text-zinc-500">Panel</span>
          </h1>
          <button
            onClick={logout}
            className="px-4 py-2 bg-zinc-800 text-xs font-bold rounded hover:bg-zinc-700"
          >
            Logout
          </button>
        </div>

        <div className="bg-[#0f0f0f] border border-zinc-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-zinc-800 bg-zinc-900/50 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
            <div className="col-span-2">Rank</div>
            <div className="col-span-7">Project</div>
            <div className="col-span-3 text-right">Actions</div>
          </div>

          <div className="divide-y divide-zinc-800">
            {bids.length === 0 ? (
              <div className="p-10 text-center text-zinc-600 italic">No bids.</div>
            ) : (
              bids.map((bid: any, index: number) => (
                <div key={bid.id} className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-zinc-800/30 transition-colors">
                  <div className="col-span-2 font-mono text-zinc-500">#{index + 1}</div>
                  <div className="col-span-7">
                    <div className="font-semibold">{bid.label}</div>
                    <div className="text-xs text-zinc-600">
                      ${Number(bid.amount).toLocaleString()} • {bid.clicks ?? 0} clicks
                    </div>
                  </div>
                  <div className="col-span-3 text-right">
                    <button
                      onClick={() => handleDelete(bid.id)}
                      className="px-3 py-1 bg-red-900/20 text-red-500 text-[10px] font-bold uppercase rounded hover:bg-red-900/40 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
