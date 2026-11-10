import type { Metadata, Viewport } from 'next';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import 'material-symbols/outlined.css';
import './globals.css';
import { AppShell } from '@/components/shell';

export const metadata: Metadata = {
  title: 'Vidora',
  description: 'A video sharing app with Shorts, posts, Stories and a creator Studio. Demo catalogue uses public-domain NASA footage.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f0f0f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
