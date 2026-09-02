"use client";

import { MonSprite } from "./mon-sprite";
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
      className={`pixel-card anim-pop group relative flex w-full flex-col items-center gap-3 rounded-xl bg-card p-5 text-left focus-visible:outline-2 ${
        fresh ? "new-glow" : ""
      }`}
      aria-label={`Open ${mon.name} entry`}
    >
      <span className="font-lcd absolute left-3 top-3 text-sm text-muted-foreground">
        {pokedexNumber(mon.pokedex_no)}
      </span>
      {pendingCount > 0 && (
        <span className="font-lcd absolute right-3 top-3 rounded border border-pokedex-yellow/40 bg-pokedex-yellow/10 px-1.5 py-0.5 text-[11px] leading-none text-pokedex-yellow">
          {pendingCount} in review
        </span>
      )}
      {fresh && (
        <span className="font-pixel absolute right-2 top-8 rounded bg-pokedex-yellow px-1.5 py-0.5 text-[8px] leading-relaxed text-black shadow-[0_0_12px_#ffcb0566]">
          NEW!
        </span>
      )}

      <div
        className={`floaty mt-2 flex h-24 w-24 items-center justify-center rounded-lg bg-[#101a1f] shadow-[inset_0_0_18px_#000000aa] transition-transform duration-200 group-hover:scale-105 ${
          fresh ? "ring-1 ring-pokedex-yellow/50" : ""
        }`}
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
        <h3 className="font-pixel text-center text-[13px] uppercase tracking-wide text-foreground transition-colors group-hover:text-pokedex-yellow">
          {displayName(mon.name)}
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-1.5 font-lcd text-[13px] leading-none">
          <MonTypeChip name={mon.name} />
          <span className="rounded border border-pokedex-cyan/30 bg-pokedex-cyan/10 px-2 py-1 text-pokedex-cyan">
            {formatNumber(mon.spotted_count)} spotted
          </span>
          <span className="rounded border border-border bg-secondary px-2 py-1 text-muted-foreground">
            by @{mon.discovered_by}
          </span>
        </div>
        <p className="line-clamp-2 min-h-[2.4em] text-center text-xs text-muted-foreground">
          {mon.description ? mon.description : "No research yet — be the first to describe it!"}
        </p>
      </div>
    </button>
  );
}
