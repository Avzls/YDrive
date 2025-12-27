import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Enable if you need to proxy API requests in development
  // async rewrites() {
  //   return [
  //     {
  //       source: '/api/:path*',
  //       destination: 'http://localhost:3000/api/:path*',
  //     },
  //   ];
  // },
};

export default nextConfig;
