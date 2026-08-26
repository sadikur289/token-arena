"use client";

// Phantom Connect provider wrapper.
// If NEXT_PUBLIC_PHANTOM_APP_ID is not set, renders children directly
// (display-only mode: leaderboard works, wallet features disabled).
import React, { useMemo } from 'react';
import { PhantomProvider, darkTheme } from '@phantom/react-sdk';
import { AddressType } from '@phantom/browser-sdk';

export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PHANTOM_APP_ID;

  const config = useMemo(() => {
    if (!appId) return null;
    return {
      providers: ['google', 'apple', 'injected'] as ('google' | 'apple' | 'injected')[],
      appId,
      addressTypes: [AddressType.solana],
      authOptions: {
        redirectUrl: typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : undefined,
      },
      autoConnect: true,
    };
  }, [appId]);

  // Don't render the SDK provider until we're on the client with an App ID —
  // avoids prerender crashes from browser-only SDK internals.
  if (!config || typeof window === 'undefined') {
    return <>{children}</>;
  }

  return (
    <PhantomProvider config={config} theme={darkTheme} appName="Token Arena">
      {children}
    </PhantomProvider>
  );
}
