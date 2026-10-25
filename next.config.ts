import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Node APIs (node:crypto) are used by many route handlers/Server Actions.
  serverExternalPackages: ["qrcode"],
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        // Static assets: immutable (they are content-hashed) or lightweight.
        source: "/assets/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
