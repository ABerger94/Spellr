import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/layout/Providers';

export const metadata: Metadata = {
  title: 'ManaVerse',
  description: 'Play Magic: The Gathering online with friends, strangers, and AI.',
  appleWebApp: {
    capable: true,
    title: 'ManaVerse',
    // 'black-translucent' draws page content underneath the iOS status bar
    // in standalone mode — on several iOS versions that shifts the
    // WebView's touch hit-testing enough to swallow taps app-wide,
    // including taps meant to focus text inputs (no keyboard ever appears).
    // 'default' avoids that at the cost of a plain status bar.
    statusBarStyle: 'default',
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
