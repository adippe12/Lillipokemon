export const TWITCH_CHANNEL = "lillimon_";

/** Fallback trigger words (server DB table `mon_triggers` is the source of truth). */
export const DEFAULT_TRIGGERS = [
  "sillymon",
  "eepymon",
  "sleepymon",
  "leafymon",
  "aquamon",
];

/**
 * Fallback reserved words — plain words that END in "mon" but must NOT become
 * species (open matching would otherwise catch them). The DB table
 * `reserved_words` is the source of truth; listeners refresh it live.
 */
export const DEFAULT_RESERVED = [
  "pokemon",
  "pokmon", // "pokémon" after canonicalization strips the é
  "demon",
  "lemon",
  "salmon",
  "common",
  "uncommon",
  "summon",
  "sermon",
  "cinnamon",
  "gammon",
];

/** Name-level profanity substrings checked before calling the server.
 *  The DB applies the FULL banned_words table server-side — this is just the
 *  cheap client/worker pre-filter (same idea as passesQuickFilter for text). */
export const QUICK_NAME_BLOCK = [
  "fuck", "shit", "bitch", "asshole", "cunt", "dick", "nigg",
  "faggot", "rape", "nazi", "pedo", "porn",
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

/**
 * Open matching regex: ANY word that ends in "mon" (at least 2 chars before it),
 * e.g. "blobmon", "SLEEPYMON_", "monmon" — capture group 2 is the base word.
 * Reserved/plain words ("demon", "pokemon", ...) are filtered in isAllowedMonName.
 */
export function buildMonWordRegex(): RegExp {
  return /(^|[^a-z0-9_])([a-z0-9]{2,}mon)_*(?![a-z0-9_])/gi;
}

/**
 * Client/worker parity check for open matching — mirrors the server-side
 * discover_mon rules (which remain the final gate):
 *   5–30 chars, starts alnum, ends "mon", not a reserved word, no profanity part.
 */
export function isAllowedMonName(canon: string, reserved: string[]): boolean {
  if (canon.length < 5 || canon.length > 30) return false;
  if (!/^[a-z0-9]/.test(canon)) return false;
  if (QUICK_NAME_BLOCK.some((w) => canon.includes(w))) return false;
  if (reserved.includes(canon)) return false;
  return canon.endsWith("mon");
}

/**
 * ONE matching entry point for every runtime (browser hook, CF worker, tests):
 *   1) admin trigger words (exact match, may have any shape)
 *   2) then any word ending in "mon" minus reserved/profane ones.
 * Returns the canonical species name, or null if nothing matches.
 */
export function findMonInText(
  text: string,
  triggerRegex: RegExp | null,
  reserved: string[]
): string | null {
  if (!text) return null;
  if (triggerRegex) {
    triggerRegex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = triggerRegex.exec(text)) !== null) {
      const c = canonicalize(m[2]);
      if (c) return c; // admin-curated trigger: trust as-is (DB re-validates)
    }
  }
  const re = buildMonWordRegex();
  re.lastIndex = 0;
  let m2: RegExpExecArray | null;
  while ((m2 = re.exec(text)) !== null) {
    const c = canonicalize(m2[2]);
    if (c && isAllowedMonName(c, reserved)) return c;
  }
  return null;
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
