/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  // Proxy Lumino API requests to the Lumino server
  async rewrites() {
    return [
      {
        source: '/lumino/:path*',
        destination: `${process.env.LUMINO_SERVER_URL || 'http://127.0.0.1:3000'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
