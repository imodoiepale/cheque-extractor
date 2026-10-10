/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'yqbmzerdagqevjdwhlwh.supabase.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Baseline browser protections on every response. SAMEORIGIN, not DENY,
  // because the dashboard shows the job PDF in its own iframe.
  // ponytail: no Content-Security-Policy yet; add one in Report-Only first,
  // since Stripe, Supabase, PostHog and inline styles all need allowances.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self), payment=(self "https://js.stripe.com")' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;