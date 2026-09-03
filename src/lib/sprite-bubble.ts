/**
 * Shared pastel helpers that must stay callable from BOTH server and client
 * components (plain module — no "use client").
 */

/** FNV-1a string hash */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    h >>>= 0;
  }
  return h >>> 0;
}

/** Deterministic PRNG */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pastel bubble background matched to each creature's hue (mirrors the first
 * rng call of the sprite generator so colors stay in the same family).
 */
export function spriteBubbleBg(name: string, seed: string): string {
  const hue = Math.floor(mulberry32(fnv1a(`${name.toLowerCase()}:${seed}`))() * 360);
  return `hsl(${hue} 78% 94%)`;
}
