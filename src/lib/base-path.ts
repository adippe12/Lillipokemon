// Base path for deployments served under a subpath (e.g. GitHub Pages: /Lillipokemon).
// Inlined at build time via NEXT_PUBLIC_BASE_PATH; empty string when served from root
// (e.g. Cloudflare Pages *.pages.dev).
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
