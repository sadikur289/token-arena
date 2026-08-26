import { Suspense } from 'react';
import ArenaClient from './arena-client';

// Dynamic: Phantom Connect SDK hooks require browser APIs at mount.
export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-zinc-500 text-sm font-mono">Loading arena…</p>
      </div>
    }>
      <ArenaClient />
    </Suspense>
  );
}
