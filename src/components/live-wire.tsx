"use client";

import { useEffect, useState } from "react";
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
 * "LIVE WIRE" — a compact realtime feed of what chat is doing right now:
 * new species discovered + spotting spikes. Rendered inside a CRT panel
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
      className={cn("crt-screen flex flex-col rounded-2xl", className)}
    >
      <div className="relative z-10 flex items-center justify-between border-b border-white/5 px-4 py-3">
        <h3 className="font-pixel flex items-center gap-2 text-[10px] text-pokedex-cyan">
          <span className="pulse-dot" aria-hidden />
          LIVE WIRE
        </h3>
        <span className="font-lcd text-xs text-muted-foreground">
          {events.length > 0 ? `${formatNumber(events.length)} events` : "standby"}
        </span>
      </div>

      <div className="relative z-10 flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {visible.length === 0 ? (
          <div className="flex h-full min-h-24 flex-col items-center justify-center gap-2 py-6 text-center">
            <span className="font-lcd text-sm text-muted-foreground">
              waiting for chat activity
              <span className="caret ml-1" aria-hidden />
            </span>
            <p className="max-w-[22ch] text-xs leading-relaxed text-muted-foreground/70">
              discoveries and spotting sprees land here in real time
            </p>
          </div>
        ) : (
          visible.map((ev) => (
            <div
              key={ev.id}
              role="log"
              className="anim-feed flex items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 transition hover:border-white/10 hover:bg-white/[0.03]"
            >
              <span
                className={`mt-0.5 shrink-0 ${ev.kind === "new" ? "led led-green" : "led led-blue"}`}
                style={{ width: 8, height: 8 }}
                aria-hidden
              />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="font-pixel truncate text-[9px]">
                  <span className={ev.kind === "new" ? "text-pokedex-yellow" : "text-pokedex-cyan"}>
                    {ev.kind === "new" ? "NEW SPECIES" : "SPOTTED"}
                  </span>
                </p>
                <p className="font-lcd truncate text-[15px] text-foreground">
                  {displayName(ev.name)}
                  {ev.by && <span className="text-muted-foreground"> · @{ev.by}</span>}
                </p>
              </div>
              <time
                className="font-lcd shrink-0 self-start pt-0.5 text-xs text-muted-foreground"
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
