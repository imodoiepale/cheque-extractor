import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
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
        {children}
      </body>
    </html>
  )
}
