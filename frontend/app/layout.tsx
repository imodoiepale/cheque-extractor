import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ToastProvider from '@/components/providers/ToastProvider'
import AIKeyWarning from '@/components/common/AIKeyWarning'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'CheckSync Pro — Automated Check Reconciliation',
  description: 'Upload check images, let AI extract the data, and auto-match against QuickBooks in seconds. Save 15+ hours per week per client. Built by iTax Hub.',
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
        {/* <AIKeyWarning /> */}
        {children}
      </body>
    </html>
  )
}
