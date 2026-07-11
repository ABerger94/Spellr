'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';
import { OnlineCountProvider } from './OnlineCountProvider';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <OnlineCountProvider>{children}</OnlineCountProvider>
    </SessionProvider>
  );
}
