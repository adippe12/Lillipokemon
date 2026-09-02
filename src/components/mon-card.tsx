"use client";

import { MonSprite, spriteBubbleBg } from "./mon-sprite";
import { MonTypeChip } from "./mon-type-chip";
import { publicImageUrl } from "@/lib/supabase";
import { displayName, pokedexNumber, formatNumber, isFreshDiscovery } from "@/lib/mons";

export function MonCard({
  mon,
  pendingCount,
  index,
  onClick,
}: {
  mon: {
    id: string;
    pokedex_no: number;
    name: string;
    discovered_by: string;
    discovered_at: string;
    last_spotted_by: string | null;
    last_spotted_at: string;
    spotted_count: number;
    image_path: string | null;
    description: string | null;
  };
  pendingCount: number;
  index: number;
  onClick: () => void;
}) {
  const fresh = isFreshDiscovery(mon.discovered_at);

  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${Math.min(index * 45, 450)}ms` }}
      className={`candy-card anim-pop group relative flex w-full flex-col items-center gap-3 p-5 pt-6 text-left focus-visible:outline-2 ${
        fresh ? "new-glow" : ""
      }`}
      aria-label={`Open ${mon.name} entry`}
    >
      <span className="font-soft absolute left-4 top-3 text-sm font-bold text-muted-foreground">
        {pokedexNumber(mon.pokedex_no)}
      </span>
      {pendingCount > 0 && (
        <span className="font-soft absolute right-3 top-3 rounded-full border border-pokedex-yellow/30 bg-pokedex-yellow/10 px-2 py-0.5 text-[11px] font-bold leading-none text-pokedex-yellow">
          {pendingCount} in review
        </span>
      )}
      {fresh && (
        <span className="wiggle font-display absolute right-2 top-9 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold leading-relaxed text-primary-foreground shadow-[0_2px_10px_rgba(240,107,168,0.45)]">
          NEW!
        </span>
      )}

      <div
        className={`floaty mt-1 flex h-24 w-24 items-center justify-center rounded-full border transition-transform duration-200 group-hover:scale-108 ${
          fresh ? "ring-2 ring-primary/40" : ""
        }`}
        style={{
          background: spriteBubbleBg(mon.name, mon.id.slice(0, 8)),
          borderColor: "rgba(255,255,255,0.8)",
          boxShadow: "inset 0 -4px 10px rgba(240,107,168,0.08), 0 4px 12px rgba(240,107,168,0.10)",
        }}
      >
        {mon.image_path ? (
          <img
            src={publicImageUrl(mon.image_path)}
            alt={`${mon.name} artwork`}
            className="h-20 w-20 rounded object-contain [image-rendering:auto]"
            loading="lazy"
          />
        ) : (
          <MonSprite name={mon.name} seed={mon.id.slice(0, 8)} size={84} />
        )}
      </div>

      <div className="w-full space-y-2">
        <h3 className="font-display text-center text-lg font-bold text-foreground transition-colors group-hover:text-primary">
          {displayName(mon.name)}
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-1.5 font-soft text-[13px] font-bold leading-none">
          <MonTypeChip name={mon.name} />
          <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-1 text-primary">
            {formatNumber(mon.spotted_count)} spotted
          </span>
          <span className="rounded-full border border-border bg-secondary px-2 py-1 text-muted-foreground">
            by @{mon.discovered_by}
          </span>
        </div>
        <p className="line-clamp-2 min-h-[2.4em] text-center text-xs leading-relaxed text-muted-foreground">
          {mon.description ? mon.description : "No research yet — be the first to describe it!"}
        </p>
      </div>
    </button>
  );
}
