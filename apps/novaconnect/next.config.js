/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        source: '/lumino/:path*',
        destination: 'http://127.0.0.1:3000/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
