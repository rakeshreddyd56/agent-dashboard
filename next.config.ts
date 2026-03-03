import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'chokidar'],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
