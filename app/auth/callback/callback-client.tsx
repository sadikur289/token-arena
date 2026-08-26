"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectBox } from '@phantom/react-sdk';

export default function AuthCallbackClient() {
  const router = useRouter();

  useEffect(() => {
    // Force immediate redirect back to home.
    // The SDK handles the session persistence in the background.
    router.replace('/');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="bg-[#0f0f0f] border border-zinc-800 rounded-2xl p-8 max-w-md w-full text-center">
        <h1 className="text-white text-xl font-bold mb-4">Completing sign-in…</h1>
        <ConnectBox />
        <p className="text-zinc-500 text-xs mt-4">
          Redirecting you back to the Arena... <br />
          <button 
            onClick={() => router.replace('/')} 
            className="text-zinc-300 underline hover:text-white"
          >
            click here if it takes too long
          </button>
        </p>
      </div>
    </div>
  );
}
