'use client';

import Link from 'next/link';
import { ErrorState, buttonVariants } from '@/components/ui';

/** Catch-all for any signed-in page that throws while rendering or loading. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl p-6" data-tone="brand">
      <ErrorState
        title="This page didn’t load"
        error={error}
        onRetry={reset}
        action={<Link href="/dashboard" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Go to dashboard</Link>}
      />
    </div>
  );
}
