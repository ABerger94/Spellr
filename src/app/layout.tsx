import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/layout/Providers';

export const metadata: Metadata = {
  title: 'ManaVerse',
  description: 'Play Magic: The Gathering online with friends, strangers, and AI.',
  appleWebApp: {
    capable: true,
    title: 'ManaVerse',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0d12',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
