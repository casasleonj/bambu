import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: process.cwd(),
  images: {
    unoptimized: true,
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'" },
      ],
    },
    {
      source: '/sw.js',
      headers: [
        { key: 'Service-Worker-Allowed', value: '/' },
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      ],
    },
  ],
};

export default nextConfig;
