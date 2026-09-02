import type { NextConfig } from "next";

// CF_EXPORT=1 -> fully static build for Cloudflare Pages (outputs to ./out).
// The app is 100% client-side (browser Twitch IRC + Supabase), so static export works.
const isExport = process.env.CF_EXPORT === "1";

const nextConfig: NextConfig = isExport
  ? {
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
      distDir: ".next-export",
      typescript: { ignoreBuildErrors: true },
      reactStrictMode: false,
    }
  : {
      output: "standalone",
      typescript: { ignoreBuildErrors: true },
      reactStrictMode: false,
    };

export default nextConfig;
