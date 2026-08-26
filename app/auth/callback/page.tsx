import { Suspense } from 'react';
import AuthCallbackClient from './callback-client';

// Force dynamic rendering — Phantom SDK requires browser APIs at mount.
export const dynamic = 'force-dynamic';

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-white text-sm">Loading…</p>
      </div>
    }>
      <AuthCallbackClient />
    </Suspense>
  );
}
