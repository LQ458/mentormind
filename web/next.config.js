/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  experimental: {
    serverActions: {
      // Allow Server Actions to be called from these origins.
      // Required when the frontend is behind a reverse proxy / Docker networking
      // where the `origin` header may be absent or set to an internal hostname.
      allowedOrigins: [
        'localhost:3000',
        '127.0.0.1:3000',
        // Docker service name used in compose networking
        'mentormind-frontend:3000',
      ],
      // Allow dynamic origin via environment variable if defined without hardcoding it in the codebase
      ...(process.env.ALLOWED_ORIGIN ? {
        allowedOrigins: [
          'localhost:3000',
          '127.0.0.1:3000',
          'mentormind-frontend:3000',
          process.env.ALLOWED_ORIGIN
        ]
      } : {}),
    },
  },
}

module.exports = nextConfig