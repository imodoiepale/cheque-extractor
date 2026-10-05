import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ToastProvider from '@/components/providers/ToastProvider'
import { AmbientBackground } from '@/components/ui/ambient-background'

// One face, loaded once, at the root. A font imported inside a single screen
// is why that screen reads as designed and the rest does not.
// `-apple-system` leads the stack (see --font-sans in globals.css); Inter is
// the fallback that carries non-Apple platforms, so it is exposed as a
// variable rather than applied as a class.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Kyriq — Automated Check Reconciliation',
  description: 'Upload check images, let AI extract the data, and auto-match against QuickBooks in seconds. Save 15+ hours per week per client.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* Glass needs something behind it to refract. Mounted once, here. */}
        <AmbientBackground />
        <ToastProvider />
        {children}
      </body>
    </html>
  )
}
