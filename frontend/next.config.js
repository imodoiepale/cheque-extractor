/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    domains: [
      'oqtprhptsjzpxtvbuhbv.supabase.co',
      'localhost',
    ],
  },
};

module.exports = nextConfig;