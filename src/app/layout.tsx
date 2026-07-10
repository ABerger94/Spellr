import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/layout/Providers';

export const metadata: Metadata = {
  title: 'Spellr',
  description: 'Play Magic: The Gathering online with friends, strangers, and AI.',
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
