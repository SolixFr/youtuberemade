import { redirect } from 'next/navigation';
import { getMe } from '@/lib/server/auth';
import { SignInForm } from './signin-form';

export const metadata = { title: 'Sign in' };

/** Only allow same-site relative redirects after sign-in. */
const safeNext = (next?: string) => (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/');

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string }> }) {
  const { next, mode } = await searchParams;
  if (await getMe() && mode !== 'signup') redirect(safeNext(next));
  return <SignInForm next={safeNext(next)} initialMode={mode === 'signup' ? 'signup' : 'signin'} />;
}
