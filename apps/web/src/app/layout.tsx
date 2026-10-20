import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'VacheLearn', template: '%s · VacheLearn' },
  description: 'Industrial learning and workforce-readiness platform (in development).',
};

// viewport-fit=cover lets fixed/sticky learner actions pad themselves clear of the home indicator (StickyActions).
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
