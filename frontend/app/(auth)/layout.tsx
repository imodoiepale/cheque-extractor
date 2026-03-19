import Link from 'next/link';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
      {/* Minimal nav */}
      <div className="px-6 py-4">
        <Link href="/" className="inline-flex items-center gap-2.5 group">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center text-white text-[10px] font-black shadow-sm">CS</div>
          <span className="text-base font-extrabold text-gray-900">CheckSync Pro</span>
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