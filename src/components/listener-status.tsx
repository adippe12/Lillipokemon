"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ListenerHealth = {
  connected: boolean;
  socketOpen: boolean;
  msgsScanned: number;
  triggers?: string[];
};

type Phase = "hidden" | "booting" | "online" | "offline";

const LISTENER_URL = process.env.NEXT_PUBLIC_LISTENER_URL || "";

/**
 * Status pill for the 24/7 server-side listener (Cloudflare Worker + Durable
 * Object, ops/listener/). Polls the worker's /health endpoint. Renders nothing
 * when NEXT_PUBLIC_LISTENER_URL is not configured.
 */
export function ListenerStatus() {
  const [phase, setPhase] = useState<Phase>(LISTENER_URL ? "booting" : "hidden");
  const [scanned, setScanned] = useState<number | null>(null);
  const alive = useRef(true);

  const poll = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch(`${LISTENER_URL}/health`, {
        signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(String(res.status));
      const health = (await res.json()) as ListenerHealth;
      if (!alive.current) return;
      setScanned(Number(health.msgsScanned ?? 0));
      setPhase(health.connected && health.socketOpen ? "online" : "offline");
    } catch {
      if (!alive.current) return;
      setPhase((p) => (p === "booting" ? p : "offline"));
    }
  }, []);

  useEffect(() => {
    if (!LISTENER_URL) return;
    alive.current = true;
    const controller = new AbortController();
    const tick = () => {
      void poll(controller.signal);
    };
    tick();
    const timer = setInterval(tick, 30_000);
    return () => {
      alive.current = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [poll]);

  if (phase === "hidden") return null;

  return (
    <div
      className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-[0_2px_8px_rgba(240,107,168,0.08)] sm:flex"
      title="Server-side 24/7 chat listener — keeps discovering species even when nobody has the site open"
    >
      <span className={`pulse-dot ${phase === "online" ? "" : "err"}`} />
      <span className="font-soft text-sm font-bold text-foreground">
        {phase === "online" ? "24/7 listener" : phase === "booting" ? "listener…" : "listener offline"}
      </span>
      {phase === "online" && scanned !== null && (
        <span className="font-soft hidden text-xs font-semibold text-muted-foreground lg:inline">
          {scanned.toLocaleString("en-US")} msgs
        </span>
      )}
    </div>
  );
}
