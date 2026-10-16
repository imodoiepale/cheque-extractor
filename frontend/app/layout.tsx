import type { Metadata } from 'next'
import { Inter, Instrument_Serif } from 'next/font/google'
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

// Page titles in the signed-in app (Ledger skin). Used only by `h1` there.
const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-serif',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://kyriq.com'),
  title: 'Kyriq — Check Reconciliation for QuickBooks Online',
  description: 'See every processed check, approve exact matches together, and review discrepancies before anything is cleared in QuickBooks Online.',
  icons: {
    icon: '/brand/kyriq-app-icon.svg',
    apple: '/brand/kyriq-app-icon.svg',
  },
  openGraph: {
    title: 'Kyriq — Check Reconciliation for QuickBooks Online',
    description: 'Reconcile checks with confidence while your team stays in control of every approval.',
    // A purpose-built 1200x630 JPEG, NOT one of the 4K landing PNGs.
    // Social scrapers fetch this URL directly and never go through Next's image
    // optimiser, so whatever is named here is downloaded at full size. The 4K
    // source is 5.79MB, over X's 5MB cap and far past the few hundred KB
    // WhatsApp will wait for — the preview silently does not render. This is
    // 86KB. Regenerate with scripts/build-og-card.py if the art changes.
    images: [{ url: '/landing/og-card-1200x630.jpg', width: 1200, height: 630 }],
    type: 'website',
    siteName: 'Kyriq',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kyriq — Check Reconciliation for QuickBooks Online',
    description: 'Reconcile checks with confidence while your team stays in control of every approval.',
    images: ['/landing/og-card-1200x630.jpg'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body>
        {/* Glass needs something behind it to refract. Mounted once, here. */}
        <AmbientBackground />
        <ToastProvider />
        {children}
      </body>
    </html>
  )
}
