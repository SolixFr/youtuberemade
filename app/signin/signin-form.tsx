'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Logo } from '@/components/chrome';
import { Button, Field } from '@/components/ui';
import { signIn, signUp } from '@/lib/actions/auth';

export function SignInForm({ next, initialMode }: { next: string; initialMode: 'signin' | 'signup' }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = mode === 'signup' ? await signUp({ name, handle, email, password }) : await signIn({ email, password });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.replace(next);
    router.refresh();
  };

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit} noValidate>
        <Logo />
        <h1>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h1>
        <p className="muted">{mode === 'signup' ? 'Your account is also your channel.' : 'to continue to Vidora'}</p>
        {mode === 'signup' && (
          <>
            <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={50} required /></Field>
            <Field label="Handle" hint="3–30 letters, numbers, dots, dashes or underscores">
              <span className="handle-input"><span>@</span><input value={handle} onChange={(e) => setHandle(e.target.value.replace(/^@/, ''))} autoComplete="username" maxLength={30} required /></span>
            </Field>
          </>
        )}
        <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required /></Field>
        <Field label="Password" hint={mode === 'signup' ? 'At least 10 characters' : undefined}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 10 : undefined} maxLength={200} required />
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="auth-actions">
          <Button variant="text" className="text-blue" onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(null); }}>
            {mode === 'signup' ? 'Sign in instead' : 'Create account'}
          </Button>
          <Button type="submit" variant="blue" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}</Button>
        </div>
      </form>
    </div>
  );
}
