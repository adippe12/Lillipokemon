"use client";

import { useEffect, useState } from "react";
import { Heart, Sparkles } from "lucide-react";
import { displayName, formatNumber, relativeTime } from "@/lib/mons";
import { cn } from "@/lib/utils";

export type FeedEvent = {
  id: string;
  kind: "new" | "spot";
  name: string; // canonical species name
  by: string; // chat user who discovered / spotted it
  ts: number; // epoch ms
};

/**
 * "CHAT BUZZ" — a compact realtime feed of what chat is doing right now:
 * new friends discovered + spotting sprees. Rendered in a soft cloud card
 * next to the hero. Self-contained: re-renders every 10s so relative
 * timestamps stay fresh.
 */
export function LiveWire({
  events,
  className,
}: {
  events: FeedEvent[];
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);

  const visible = events.slice(0, 9);

  return (
    <aside
      aria-label="Live activity feed"
      className={cn("candy-card flex flex-col overflow-hidden", className)}
    >
      <div className="flex items-center justify-between border-b border-border bg-secondary/70 px-4 py-3">
        <h3 className="font-display flex items-center gap-2 text-sm font-bold text-primary">
          <span className="pulse-dot" aria-hidden />
          CHAT BUZZ
        </h3>
        <span className="font-soft text-xs font-bold text-muted-foreground">
          {events.length > 0 ? `${formatNumber(events.length)} events` : "standby"}
        </span>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {visible.length === 0 ? (
          <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 py-6 text-center">
            <span className="font-soft text-sm font-bold text-muted-foreground">
              waiting for chat chatter
              <span className="caret ml-1" aria-hidden />
            </span>
            <p className="max-w-[24ch] text-xs leading-relaxed text-muted-foreground/80">
              new friends and spotting sprees land here in real time
            </p>
          </div>
        ) : (
          visible.map((ev) => (
            <div
              key={ev.id}
              role="log"
              className="anim-feed flex items-center gap-2.5 rounded-xl border border-transparent px-2 py-1.5 transition hover:border-border hover:bg-secondary/60"
            >
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                  ev.kind === "new" ? "bg-primary/15 text-primary" : "bg-[#8ecdf7]/25 text-pokedex-cyan"
                )}
                aria-hidden
              >
                {ev.kind === "new" ? <Sparkles className="h-3.5 w-3.5" /> : <Heart className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="font-display truncate text-[10px] font-bold uppercase tracking-wide">
                  <span className={ev.kind === "new" ? "text-primary" : "text-pokedex-cyan"}>
                    {ev.kind === "new" ? "NEW FRIEND" : "SPOTTED"}
                  </span>
                </p>
                <p className="font-soft truncate text-[15px] font-bold text-foreground">
                  {displayName(ev.name)}
                  {ev.by && <span className="font-semibold text-muted-foreground"> · @{ev.by}</span>}
                </p>
              </div>
              <time
                className="font-soft shrink-0 self-start pt-0.5 text-xs font-semibold text-muted-foreground"
                dateTime={new Date(ev.ts).toISOString()}
              >
                {relativeTime(new Date(ev.ts).toISOString(), now)}
              </time>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
