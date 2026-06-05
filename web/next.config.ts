import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: '/e-sop-atrbpn',
  trailingSlash: true,
  images: {
    unoptimized: true, // <-- Tambahkan baris ini untuk bypass error _next/image 404
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;