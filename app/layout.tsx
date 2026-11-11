import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { AppShell } from '@/components/shell';
import { getMe } from '@/lib/server/auth';
import { shellData } from '@/lib/server/queries';
import type { Theme } from '@/lib/types';

export const metadata: Metadata = {
  title: { default: 'Vidora', template: '%s - Vidora' },
  description: 'Watch, upload and share videos, Shorts, posts and Stories.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0f0f0f' }, { media: '(prefers-color-scheme: light)', color: '#ffffff' }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  const cookieTheme = (await cookies()).get('vidora_theme')?.value as Theme | undefined;
  const theme: Theme = me?.settings.theme ?? (cookieTheme && ['dark', 'light', 'system'].includes(cookieTheme) ? cookieTheme : 'dark');
  const { subscriptions: subs, badges } = me ? shellData(me.id) : { subscriptions: [], badges: { notifications: 0, messages: 0 } };
  return (
    <html lang="en" data-theme={theme}>
      <body>
        <AppShell me={me} subscriptions={subs} badges={badges}>{children}</AppShell>
      </body>
    </html>
  );
}
