import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.externals = config.externals || [];
    return config;
  },
};

export default nextConfig;
