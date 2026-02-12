import Link from 'next/link';
import { CheckSquare, Upload, Settings, List, BarChart3, Download, Receipt } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/upload', icon: Upload, label: 'Upload' },
  { href: '/dashboard', icon: List, label: 'Documents' },
  { href: '/export', icon: Download, label: 'Export' },
  { href: '/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/billing', icon: Receipt, label: 'Billing' },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f5f5f7] flex">
      {/* Sidebar */}
      <aside className="w-[220px] bg-white/80 backdrop-blur-xl border-r border-gray-200/60 hidden md:flex flex-col">
        <div className="px-5 py-5 border-b border-gray-100/80">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-[15px] text-gray-900">
            <CheckSquare className="w-5 h-5 text-blue-600" />
            <span>CheckPro</span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100/70 rounded-lg transition-colors"
            >
              <item.icon className="w-[16px] h-[16px]" />
              <span>{item.label}</span>
            </Link>
          ))}

          <div className="my-2 border-t border-gray-100/80" />

          <Link
            href="/settings"
            className="flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100/70 rounded-lg transition-colors"
          >
            <Settings className="w-[16px] h-[16px]" />
            <span>Settings</span>
          </Link>
        </nav>

        <div className="px-5 py-3 border-t border-gray-100/80 text-[11px] text-gray-400">
          CheckPro v1.0.0
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile Header */}
        <div className="md:hidden px-4 py-3 bg-white/80 backdrop-blur-xl border-b border-gray-200/60 flex justify-between items-center">
          <Link href="/dashboard" className="font-semibold text-[15px] text-gray-900 flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-blue-600" />
            CheckPro
          </Link>
          <Link href="/upload" className="p-1.5 bg-blue-50 rounded-lg">
            <Upload className="w-4 h-4 text-blue-600" />
          </Link>
        </div>

        {children}
      </main>
    </div>
  );
}
