import type { NextConfig } from "next";

// CF_EXPORT=1 -> fully static build for Cloudflare Pages / GitHub Pages (outputs to ./.next-export).
// The app is 100% client-side (browser Twitch IRC + Supabase), so static export works.
// BASE_PATH -> subpath deployments (GitHub Pages serves the site under /<repo-name>).
const isExport = process.env.CF_EXPORT === "1";
const basePath = process.env.BASE_PATH || undefined;

const nextConfig: NextConfig = isExport
  ? {
      output: "export",
      trailingSlash: true,
      images: { unoptimized: true },
      distDir: ".next-export",
      basePath,
      typescript: { ignoreBuildErrors: true },
      reactStrictMode: false,
    }
  : {
      output: "standalone",
      typescript: { ignoreBuildErrors: true },
      reactStrictMode: false,
    };

export default nextConfig;
