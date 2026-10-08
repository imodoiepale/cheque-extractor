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
          <Image src="/Kyriq_Logo_Files/kyriq-icon.svg" alt="Kyriq" width={32} height={32} className="rounded-md shadow-contact" />
          <span className="text-base font-extrabold text-ink-strong tracking-wordmark">Kyriq</span>
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
