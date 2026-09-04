"use client";

import { useMemo } from "react";
import { spriteBubbleBg } from "@/lib/sprite-bubble";

export { spriteBubbleBg };

/** FNV-1a string hash */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
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

const W = 12;
const H = 12;

type Pixel = { x: number; y: number; c: string };

function buildSprite(name: string, seed: string, shiny: boolean) {
  const rng = mulberry32(fnv1a(`${name.toLowerCase()}:${seed}`));
  const hue = (Math.floor(rng() * 360) + (shiny ? 150 : 0)) % 360;

  const body = `hsl(${hue} 72% 60%)`;
  const bodyDark = `hsl(${hue} 58% 42%)`;
  const outline = `hsl(${hue} 55% 24%)`;
  const belly = `hsl(${hue} 80% 78%)`;
  const cheek = `hsl(${(hue + 45) % 360} 85% 68%)`;
  const eye = "hsl(260 30% 14%)";
  const shine = "hsl(0 0% 100%)";

  const pixels = new Map<string, string>();
  const set = (x: number, y: number, c: string) => {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    pixels.set(`${x},${y}`, c);
  };
  const get = (x: number, y: number) => pixels.get(`${x},${y}`);

  // --- body silhouette: per-row half-width, mirrored around center (5.5) ---
  const halfW: number[] = new Array(H).fill(0);
  const wobble: number[] = [];
  for (let i = 0; i < H; i++) wobble.push((rng() * 2 - 1) * 1.1);
  for (let y = 0; y < H; y++) {
    const t = (y - 2.2) / 8.2; // 0 at row 2.2, 1 at row 10.4
    if (t < -0.05 || t > 1.05) {
      halfW[y] = 0;
      continue;
    }
    const tc = Math.min(Math.max(t, 0), 1);
    const base = Math.pow(Math.sin(Math.PI * tc), 0.75) * 5.7;
    halfW[y] = Math.max(0, Math.min(6, Math.round(base + wobble[y])));
  }
  // ensure a solid middle
  for (const y of [5, 6, 7]) halfW[y] = Math.max(halfW[y], 5);

  for (let y = 0; y < H; y++) {
    const w = halfW[y];
    if (w <= 0) continue;
    for (let x = 6 - w; x <= 5 + w; x++) {
      set(x, y, body);
    }
  }

  // --- top decorations: ears / antenna / horns / none ---
  const topStart = halfW.findIndex((w) => w > 0);
  const deco = ["ears", "antenna", "horns", "none"][Math.floor(rng() * 4)];
  if (topStart >= 2) {
    if (deco === "ears") {
      set(2, topStart - 2, bodyDark);
      set(3, topStart - 1, bodyDark);
      set(9, topStart - 2, bodyDark);
      set(8, topStart - 1, bodyDark);
    } else if (deco === "antenna") {
      set(5, topStart - 2, bodyDark);
      set(6, topStart - 2, bodyDark);
      set(5, topStart - 1, accentColor(rng, hue));
      set(6, topStart - 1, accentColor(rng, hue));
    } else if (deco === "horns") {
      set(1, topStart - 1, cheek);
      set(2, topStart - 1, bodyDark);
      set(10, topStart - 1, cheek);
      set(9, topStart - 1, bodyDark);
    }
  }

  // --- outline: any body pixel adjacent to a transparent pixel (or edge) ---
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!get(x, y)) continue;
      const around = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      if (around.some(([ax, ay]) => !get(ax, ay))) set(x, y, outline);
    }
  }

  // --- belly patch ---
  const bellyRows = [7, 8, 9];
  for (const y of bellyRows) {
    const w = halfW[y];
    if (w < 3) continue;
    for (let x = 4; x <= 7; x++) set(x, y, belly);
  }

  // --- face ---
  const eyeRow = rng() > 0.5 ? 4 : 5;
  const eyeCol = 3;
  for (const c of [eyeCol, W - 1 - eyeCol]) {
    set(c, eyeRow, eye);
    set(c, eyeRow + 1, eye);
    set(c, eyeRow - 1, shine);
  }
  if (rng() > 0.35) {
    set(2, eyeRow + 2, cheek);
    set(9, eyeRow + 2, cheek);
  }
  // mouth
  const mouthRow = eyeRow + 3;
  if (rng() > 0.5) {
    set(5, mouthRow, eye);
    set(6, mouthRow, eye);
  }

  // --- feet ---
  const feetRow = 10;
  if (halfW[feetRow] > 2 && rng() > 0.4) {
    set(3, feetRow, outline);
    set(8, feetRow, outline);
  }

  // --- sparkles for shiny ---
  if (shiny) {
    set(rng() > 0.5 ? 1 : 10, 2, "hsl(50 100% 70%)");
    set(rng() > 0.5 ? 0 : 11, 7, "hsl(50 100% 70%)");
  }

  return Array.from(pixels.entries()).map<Pixel>(([key, c]) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y, c };
  });
}

function accentColor(rng: () => number, hue: number): string {
  const h = (hue + 160 + Math.floor(rng() * 80)) % 360;
  return `hsl(${h} 85% 62%)`;
}

/**
 * Soft pastel bubble color matched to the creature's own hue.
 * Mirrors the first rng() call of buildSprite (the hue pick), so a sprite
 * and its bubble always agree — deterministic per name+seed.
 */

/**
 * Mystery-mon treatment: the pixel sprite stays crisp and fully visible
 * (it is the creature's identity until real art lands), and a small
 * solid-pink "?" badge pinned to the bottom-right corner signals that
 * official artwork is still wanted — like a "quest available" marker.
 */
export function MonSprite({
  name,
  seed,
  size = 96,
  shiny = false,
  className,
  needsArt = false,
}: {
  name: string;
  seed?: string;
  size?: number;
  shiny?: boolean;
  className?: string;
  /** True when the mon has no approved artwork yet: stamps a "?" quest
   *  badge on top so chat can tell the picture is still missing. */
  needsArt?: boolean;
}) {
  const pixels = useMemo(() => buildSprite(name, seed ?? name, shiny), [name, seed, shiny]);

  const svg = (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={needsArt ? `Placeholder sprite of ${name} — artwork still needed` : `Pixel sprite of ${name}`}
    >
      {pixels.map((p) => (
        <rect key={`${p.x},${p.y}`} x={p.x} y={p.y} width={1.02} height={1.02} fill={p.c} />
      ))}
    </svg>
  );

  if (!needsArt) return svg;

  const badge = Math.max(14, Math.round(size * 0.42));
  const badgeFont = Math.max(9, Math.round(size * 0.25));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {svg}
      <span
        aria-hidden
        className="font-display absolute flex items-center justify-center rounded-full border-2 border-white bg-primary font-black text-primary-foreground shadow-[0_2px_8px_rgba(240,107,168,0.35)]"
        style={{
          right: -Math.round(size * 0.02),
          bottom: -Math.round(size * 0.02),
          width: badge,
          height: badge,
          fontSize: badgeFont,
          lineHeight: 1,
          paddingBottom: Math.round(size * 0.01),
        }}
      >
        ?
      </span>
    </span>
  );
}
