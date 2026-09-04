import { MAX_IMAGE_MB } from "./mons";

/**
 * GIPHY image search for the artwork proposal flow.
 *
 * Design notes:
 * - The API key is a FREE Giphy developer key (developers.giphy.com), baked at
 *   build time via NEXT_PUBLIC_GIPHY_API_KEY. Without it the picker is simply
 *   not rendered anywhere — the site keeps today's upload-only flow.
 * - We never hotlink GIPHY media in the dex. The viewer's browser downloads
 *   the chosen GIF (media.giphy.com sends `access-control-allow-origin: *`)
 *   and re-uploads it to our own Supabase storage as a regular pending
 *   proposal, so approval, storage layout and rendering are unchanged.
 * - `rating=g` keeps results family-friendly, matching the site's tone.
 */

export const GIPHY_ENABLED = Boolean(process.env.NEXT_PUBLIC_GIPHY_API_KEY);

const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? "";
const GIPHY_API = "https://api.giphy.com/v1/gifs";

export type GiphyGif = {
  id: string;
  title: string;
  /** Static first-frame thumbnail (grid). */
  thumb: string;
  /** Animated 200px rendition (hover + preview). */
  thumbAnim: string;
  /** Rendition we download and re-upload (≈320px wide, usually well under 2MB). */
  fileUrl: string;
};

export type GiphySearchError = "no-key" | "blocked" | "network";

type GiphyRendition = { url?: string };
type GiphyApiGif = { id: string; title?: string; images: Record<string, GiphyRendition | undefined> };

function mapGif(g: GiphyApiGif): GiphyGif | null {
  const anim = g.images.fixed_width?.url ?? "";
  const still = g.images.fixed_width_still?.url ?? "";
  // downsized_medium (320px) keeps us under the 2MB upload cap in practice;
  // fall back toward the original so weird entries still submit something.
  const file =
    g.images.downsized_medium?.url || anim || g.images.original?.url || "";
  if (!file) return null;
  return {
    id: g.id,
    title: g.title ?? "",
    thumb: still || anim || file,
    thumbAnim: anim || file,
    fileUrl: file,
  };
}

// Tiny per-session cache so toggling tabs / retyping a term doesn't burn the
// API rate limit (unverified Giphy keys are tightly rate-limited per hour).
const cache = new Map<string, GiphyGif[]>();

export async function searchGiphy(
  query: string,
  offset: number,
  limit: number,
  signal?: AbortSignal
): Promise<{ items: GiphyGif[]; error?: GiphySearchError }> {
  if (!GIPHY_ENABLED || !GIPHY_KEY) return { items: [], error: "no-key" };

  const key = `${query}::${offset}::${limit}`;
  const hit = cache.get(key);
  if (hit) return { items: hit };

  const params = new URLSearchParams({
    api_key: GIPHY_KEY,
    limit: String(limit),
    offset: String(offset),
    rating: "g",
  });
  const url = query
    ? `${GIPHY_API}/search?${params.toString()}&q=${encodeURIComponent(query)}&lang=en`
    : `${GIPHY_API}/trending?${params.toString()}`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return { items: [], error: "blocked" };
    const json = (await res.json()) as { data?: GiphyApiGif[] };
    const items = (json.data ?? [])
      .map(mapGif)
      .filter((g): g is GiphyGif => g !== null);
    if (cache.size > 60) cache.clear();
    cache.set(key, items);
    return { items };
  } catch {
    // AbortError lands here too; the caller drops the result when it aborted.
    return { items: [], error: "network" };
  }
}

/**
 * Download the chosen GIF and wrap it as a File so it flows through the exact
 * same storage upload + proposal insert as a hand-picked image file.
 * Throws with a viewer-friendly message on failure / oversize.
 */
export async function fetchGifAsFile(gif: GiphyGif, monName: string): Promise<File> {
  let res: Response;
  try {
    res = await fetch(gif.fileUrl);
  } catch {
    throw new Error("Couldn't download that GIF — pick another one.");
  }
  if (!res.ok) throw new Error("Couldn't download that GIF — pick another one.");
  const blob = await res.blob();
  if (blob.size > MAX_IMAGE_MB * 1024 * 1024) {
    throw new Error(`That GIF is too heavy (max ${MAX_IMAGE_MB}MB) — try a shorter one.`);
  }
  return new File([blob], `${monName}-giphy-${gif.id}.gif`, { type: "image/gif" });
}
