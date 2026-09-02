"use client";

import { useEffect, useState } from "react";
import { Heart, Sparkles } from "lucide-react";
import { displayName, relativeTime } from "@/lib/mons";
import { cn } from "@/lib/utils";

export type FeedEvent = {
  id: string;
  kind: "new" | "spot";
  name: string; // canonical species name
  by: string; // chat user who discovered / spotted it
  ts: number; // epoch ms
};

/**
 * "CHAT BUZZ" — a slim horizontal ticker of what chat is doing right now:
 * new friends discovered + spotting sprees, as cute scrollable pills.
 * Sits between the hero and the dex grid without stealing the spotlight:
 * the mons stay the focus of the page. Self-contained: re-renders every
 * 10s so relative timestamps stay fresh.
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

  const visible = events.slice(0, 12);

  return (
    <aside
      aria-label="Live activity feed"
      className={cn("candy-card flex w-full items-stretch overflow-hidden", className)}
    >
      {/* fixed label chip */}
      <div className="flex shrink-0 items-center gap-2 self-stretch rounded-l-[1.3rem] border-r border-border bg-secondary/80 px-3.5 py-2.5 sm:px-4">
        <span className="pulse-dot" aria-hidden />
        <h3 className="font-display text-[13px] font-bold whitespace-nowrap text-primary">
          CHAT&nbsp;BUZZ
        </h3>
      </div>

      {/* scrollable pill track */}
      <div
        className="buzz-track flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-2.5 py-2"
        role="log"
      >
        {visible.length === 0 ? (
          <span className="font-soft flex items-center gap-1.5 px-1 text-[13px] font-semibold whitespace-nowrap text-muted-foreground">
            waiting for chat chatter
            <span className="caret" aria-hidden />
          </span>
        ) : (
          visible.map((ev) => (
            <span
              key={ev.id}
              className="anim-feed font-soft flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card py-1 pr-2.5 pl-1.5 text-[13px] leading-none font-semibold whitespace-nowrap"
            >
              <span
                className={cn(
                  "flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full",
                  ev.kind === "new" ? "bg-primary/15 text-primary" : "bg-[#8ecdf7]/25 text-pokedex-cyan"
                )}
                aria-hidden
              >
                {ev.kind === "new" ? <Sparkles className="h-3 w-3" /> : <Heart className="h-3 w-3" />}
              </span>
              <span className={cn("font-bold", ev.kind === "new" ? "text-primary" : "text-pokedex-cyan")}>
                {ev.kind === "new" ? "NEW" : "SPOT"}
              </span>
              <span className="max-w-[13ch] truncate font-bold text-foreground sm:max-w-[18ch]">
                {displayName(ev.name)}
              </span>
              {ev.by && (
                <span className="max-w-[10ch] truncate text-muted-foreground sm:max-w-[14ch]">@{ev.by}</span>
              )}
              <time
                className="text-muted-foreground/80"
                dateTime={new Date(ev.ts).toISOString()}
              >
                {relativeTime(new Date(ev.ts).toISOString(), now)}
              </time>
            </span>
          ))
        )}
      </div>
    </aside>
  );
}
