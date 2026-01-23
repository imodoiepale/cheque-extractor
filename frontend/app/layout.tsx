import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Link from 'next/link'
import { CheckSquare, Upload, Settings, List } from 'lucide-react'
import ToastProvider from '@/components/providers/ToastProvider'
import AIKeyWarning from '@/components/common/AIKeyWarning'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'OCR Check Processor',
  description: 'Enterprise-grade check processing with AI',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ToastProvider />
        <AIKeyWarning />
        <div className="min-h-screen bg-gray-50 flex">
          {/* Sidebar */}
          <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
            <div className="p-6 border-b border-gray-100">
              <Link href="/" className="flex items-center gap-2 font-bold text-xl text-blue-600">
                <CheckSquare className="w-6 h-6" />
                <span>CheckPro</span>
              </Link>
            </div>

            <nav className="flex-1 p-4 space-y-1">
              <Link href="/upload" className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <Upload className="w-5 h-5" />
                <span>Upload Checks</span>
              </Link>

              <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <List className="w-5 h-5" />
                <span>All Checks</span>
              </Link>

              <Link href="/settings" className="flex items-center gap-3 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <Settings className="w-5 h-5" />
                <span>Settings</span>
              </Link>
            </nav>

            <div className="p-4 border-t text-xs text-gray-400">
              v1.0.0
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            {/* Mobile Header (visible only on small screens) */}
            <div className="md:hidden p-4 bg-white border-b flex justify-between items-center">
              <Link href="/" className="font-bold text-lg text-blue-600">CheckPro</Link>
              <Link href="/upload" className="p-2 bg-blue-50 rounded-full"><Upload className="w-5 h-5 text-blue-600" /></Link>
            </div>

            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
