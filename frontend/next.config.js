/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      'your-project.supabase.co',
      'localhost',
    ],
  },
  experimental: {
    serverActions: true,
  },
};

module.exports = nextConfig;