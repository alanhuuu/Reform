/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow base64 data URLs for screenshots (no external image domains needed)
  images: {
    unoptimized: true,
  },

  // Production security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
