import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  images: { remotePatterns: [] },
  poweredByHeader: false,
};

export default nextConfig;
