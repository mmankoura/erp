import type { NextConfig } from "next";

// The backend's dev port. Defaults to 3002, which is what a single checkout
// uses; a parallel worktree can point at its own backend via .env.local
// (gitignored) without editing this file or colliding on the port.
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:3002";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_PROXY_TARGET}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
