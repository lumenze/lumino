/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
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
