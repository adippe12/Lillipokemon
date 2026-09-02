"use client";

import { MonSprite } from "./mon-sprite";
import { publicImageUrl } from "@/lib/supabase";
import { displayName, pokedexNumber, formatNumber } from "@/lib/mons";
import { Badge } from "@/components/ui/badge";

export function MonCard({
  mon,
  pendingCount,
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
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="pixel-card group relative flex w-full flex-col items-center gap-3 rounded-xl bg-card p-5 text-left"
      aria-label={`Open ${mon.name} entry`}
    >
      <span className="font-lcd absolute left-3 top-3 text-sm text-muted-foreground">
        {pokedexNumber(mon.pokedex_no)}
      </span>
      {pendingCount > 0 && (
        <Badge
          variant="secondary"
          className="absolute right-3 top-3 border border-pokedex-yellow/40 bg-pokedex-yellow/10 font-lcd text-[11px] text-pokedex-yellow"
        >
          {pendingCount} in review
        </Badge>
      )}

      <div className="floaty mt-2 flex h-24 w-24 items-center justify-center rounded-lg bg-[#101a1f] shadow-[inset_0_0_18px_#000000aa]">
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
        <h3 className="font-pixel text-center text-[13px] uppercase tracking-wide text-foreground group-hover:text-pokedex-yellow">
          {displayName(mon.name)}
        </h3>
        <div className="flex flex-wrap items-center justify-center gap-1.5 font-lcd text-[13px] leading-none">
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
