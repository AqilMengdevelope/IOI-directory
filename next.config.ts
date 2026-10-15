import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  // Dev only: let Cloudflare quick tunnels (cloudflared tunnel --url …) load dev assets and HMR.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // The service worker must always be re-fetched so updates to it roll out on the next visit.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
