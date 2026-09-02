export const TWITCH_CHANNEL = "lillimon_";

/** Fallback trigger words (server DB table `mon_triggers` is the source of truth). */
export const DEFAULT_TRIGGERS = [
  "sillymon",
  "eepymon",
  "sleepymon",
  "leafymon",
  "aquamon",
];

export const MAX_DESCRIPTION = 280;
export const MAX_NICKNAME = 30;
export const MAX_IMAGE_MB = 2;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export type Mon = {
  id: string;
  pokedex_no: number;
  name: string;
  discovered_by: string;
  discovered_at: string;
  last_spotted_by: string | null;
  last_spotted_at: string;
  spotted_count: number;
  description: string | null;
  description_by: string | null;
  image_path: string | null;
  image_by: string | null;
};

export type Proposal = {
  id: string;
  mon_id: string;
  kind: "description" | "image";
  content: string;
  submitted_by: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export type MonWithMeta = Mon & { pending_count: number };

/** Normalize a raw chat word to a canonical species name. */
export function canonicalize(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/_+$/, "")
    .replace(/[^a-z0-9_]/g, "");
}

/**
 * Build a chat matching regex from trigger words.
 * Matches "sillymon", "sillymon_", " SLEEPYMON " ... but NOT "supersillymon" / "sillymonster".
 * Uses capture group 2 for the base word (avoids lookbehind for older Safari).
 */
export function buildTriggerRegex(words: string[]): RegExp | null {
  const cleaned = Array.from(
    new Set(words.map((w) => canonicalize(w)).filter((w) => w.length >= 2 && w.length <= 30))
  );
  if (cleaned.length === 0) return null;
  const escaped = cleaned.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(^|[^a-z0-9_])(${escaped.join("|")})_*(?![a-z0-9_])`, "gi");
}

/** Tiny client-side pre-filter for instant feedback (the real filter is server-side). */
export function passesQuickFilter(text: string): boolean {
  const t = text.toLowerCase();
  const quickBad = [
    "fuck", "shit", "bitch", "asshole", "cunt", "dick", "penis", "vagina",
    "nigg", "faggot", "rape", "nazi", "hitler", "pedo", "porn", "sex",
    "n1gg", "f4ggot", "p0rn", "b1tch", "sh1t", "wtf",
  ];
  return !quickBad.some((w) => t.includes(w));
}

export function displayName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function pokedexNumber(no: number): string {
  return `#${String(no).padStart(3, "0")}`;
}
