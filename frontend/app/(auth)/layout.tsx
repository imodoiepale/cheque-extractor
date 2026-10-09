import Link from 'next/link';
import Image from 'next/image';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // No gradient of its own: the ambient mesh in app/layout.tsx is the page
    // background, and the auth card glass refracts it.
    <div className="min-h-screen flex flex-col">
      {/* Minimal nav */}
      <div className="px-6 py-4">
        <Link href="/" className="inline-flex items-center gap-2.5 group press">
          <Image src="/brand/kyriq-logo.svg" alt="Kyriq" width={97} height={40} priority />
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
