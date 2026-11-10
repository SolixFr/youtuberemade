import Link from 'next/link';
import { EmptyState, Icon } from './ui';

/** Shown on pages that need an account. */
export function SignedOut({ icon, title, text, next }: { icon: string; title: string; text: string; next: string }) {
  return (
    <EmptyState icon={icon} title={title} text={text}
      action={<Link href={`/signin?next=${encodeURIComponent(next)}`} className="btn btn-outline btn-md"><Icon name="account_circle" />Sign in</Link>} />
  );
}
