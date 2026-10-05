'use client';

import Link from 'next/link';
import { FileQuestion, Home, ArrowLeft } from 'lucide-react';
import { Button, GlassCard, buttonVariants } from '@/components/ui';

const QUICK_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/upload', label: 'Upload' },
  { href: '/settings', label: 'Settings' },
  { href: '/login', label: 'Login' },
];

export default function NotFound() {
  return (
    // Transparent over the ambient mesh mounted in app/layout.tsx.
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <GlassCard padding="lg" reveal className="p-8">
          <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-primary-bg mb-6">
            <FileQuestion className="h-12 w-12 text-primary-text" />
          </div>

          <h1 className="text-6xl font-bold text-ink-strong mb-2 nums">404</h1>
          <h2 className="text-2xl font-semibold text-ink-strong mb-4">Page Not Found</h2>

          <p className="text-ink-body mb-8">
            Oops! The page you&apos;re looking for doesn&apos;t exist. It might have been moved or deleted.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {/* A Link, not a Button: a <button> inside an <a> is invalid HTML,
                so the primary pill is applied to the anchor itself. */}
            <Link href="/" className={buttonVariants()}>
              <Home className="h-5 w-5" />
              Go Home
            </Link>
            <Button
              variant="secondary"
              icon={<ArrowLeft className="h-5 w-5" />}
              onClick={() => window.history.back()}
            >
              Go Back
            </Button>
          </div>

          <div className="mt-8 pt-6 border-t border-glass-hairline">
            <p className="text-sm text-ink-faint mb-4">Looking for something specific?</p>
            <div className="flex flex-wrap gap-2 justify-center text-sm">
              {QUICK_LINKS.map((link, i) => (
                <span key={link.href} className="inline-flex items-center gap-2">
                  {i > 0 && <span className="text-ink-faint/60" aria-hidden>&bull;</span>}
                  <Link href={link.href} className="text-primary-text hover:underline">
                    {link.label}
                  </Link>
                </span>
              ))}
            </div>
          </div>
        </GlassCard>

        <p className="text-sm text-ink-body mt-6">
          Need help?{' '}
          <a href="mailto:support@chequeextractor.com" className="text-primary-text hover:underline">
            Contact Support
          </a>
        </p>
      </div>
    </div>
  );
}
