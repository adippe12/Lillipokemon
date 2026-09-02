"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { BASE_PATH } from "@/lib/base-path";
import {
  type Mon,
  TWITCH_CHANNEL,
  DEFAULT_TRIGGERS,
  displayName,
  formatNumber,
} from "@/lib/mons";
import { useTwitchChat, type ChatMessage } from "@/lib/use-twitch-chat";
import { MonCard } from "@/components/mon-card";
import { MonDetailDialog } from "@/components/mon-detail";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Activity,
  BookOpen,
  ExternalLink,
  FlaskConical,
  Heart,
  Radio,
  ShieldCheck,
  Volume2,
  VolumeX,
} from "lucide-react";

function blip(kind: "new" | "spot") {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = kind === "new" ? [523.25, 659.25, 783.99] : [440, 587.33];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.035, now + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start(now + i * 0.09);
      o.stop(now + i * 0.09 + 0.16);
    });
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    /* audio not available */
  }
}

// ---- tiny external store for the mute preference ----
const muteListeners = new Set<() => void>();
function subscribeMute(listener: () => void) {
  muteListeners.add(listener);
  return () => muteListeners.delete(listener);
}

function celebrate() {
  const colors = ["#e3350d", "#ffcb05", "#4fd8e8", "#fff8e7", "#8bd450"];
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.7 }, colors, disableForReducedMotion: true });
  setTimeout(
    () => confetti({ particleCount: 60, spread: 100, origin: { x: 0.15, y: 0.6 }, colors, disableForReducedMotion: true }),
    220
  );
  setTimeout(
    () => confetti({ particleCount: 60, spread: 100, origin: { x: 0.85, y: 0.6 }, colors, disableForReducedMotion: true }),
    380
  );
}

export default function PokedexPage() {
  const [triggers, setTriggers] = useState<string[]>(DEFAULT_TRIGGERS);
  const [mons, setMons] = useState<Mon[]>([]);
  const [pending, setPending] = useState<Record<string, number>>({});
  const [setupError, setSetupError] = useState<string | null>(
    supabaseConfigured ? null : "The Pokedex archives are not linked yet."
  );
  const [loading, setLoading] = useState(supabaseConfigured);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ name: string; isNew: boolean; by: string } | null>(null);

  const celebrated = useRef<Set<string>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((name: string, isNew: boolean, by: string) => {
    setToast({ name, isNew, by });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5200);
  }, []);

  // sound preference (reactive localStorage via useSyncExternalStore)
  const muted = useSyncExternalStore(
    subscribeMute,
    () => {
      try {
        return localStorage.getItem("lp_muted") === "1";
      } catch {
        return false;
      }
    },
    () => true
  );
  const toggleMute = () => {
    try {
      localStorage.setItem("lp_muted", muted ? "0" : "1");
      muteListeners.forEach((l) => l());
    } catch {
      /* storage unavailable */
    }
  };

  // ---- data loading ----
  const loadMons = useCallback(async () => {
    if (!supabaseConfigured) return;
    const { data, error } = await supabase
      .from("mons")
      .select("*")
      .order("pokedex_no", { ascending: true });
    if (error) {
      console.error("loadMons failed:", error.message);
      setSetupError("The Pokedex archives could not be reached. Refresh to retry.");
      return;
    }
    setMons((data ?? []) as Mon[]);
  }, []);

  const loadPending = useCallback(async () => {
    if (!supabaseConfigured) return;
    const { data } = await supabase.rpc("pending_counts");
    const map: Record<string, number> = {};
    for (const row of (data ?? []) as { mon_id: string; pending_count: number }[]) {
      map[row.mon_id] = Number(row.pending_count);
    }
    setPending(map);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    (async () => {
      await Promise.all([loadMons(), loadPending()]);
      setLoading(false);
    })().catch(() => setLoading(false));

    // triggers
    supabase
      .from("mon_triggers")
      .select("word")
      .then(({ data }) => {
        const words = (data ?? []).map((r: { word: string }) => r.word);
        if (words.length) setTriggers(words);
      });

    // realtime
    const channel = supabase
      .channel("lillipokedex-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mons" },
        (payload) => {
          const mon = payload.new as Mon;
          void loadMons();
          void loadPending();
          if (!celebrated.current.has(mon.id)) {
            celebrated.current.add(mon.id);
            showToast(mon.name, true, mon.discovered_by);
            if (!muted) blip("new");
            celebrate();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "mons" },
        () => {
          void loadMons();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "mons" },
        (payload) => {
          const old = payload.old as { id: string };
          celebrated.current.delete(old.id);
          setMons((prev) => prev.filter((m) => m.id !== old.id));
          setPending((prev) => {
            if (!(old.id in prev)) return prev;
            const next = { ...prev };
            delete next[old.id];
            return next;
          });
          setSelectedId((sel) => (sel === old.id ? null : sel));
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mon_triggers" },
        (payload) => {
          const row = payload.new as { word: string };
          setTriggers((prev) => (prev.includes(row.word) ? prev : [...prev, row.word]));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "mon_triggers" },
        (payload) => {
          const old = payload.old as { word: string };
          setTriggers((prev) => prev.filter((w) => w !== old.word));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
     
  }, [loadMons, loadPending]);

  // ---- twitch chat discovery ----
  const handleMatch = useCallback(
    async (_msg: ChatMessage, canonical: string) => {
      if (!supabaseConfigured) return;
      const { error } = await supabase.rpc("discover_mon", {
        p_name: canonical,
        p_by: _msg.displayName || _msg.user,
      });
      if (!error) void loadMons();
    },
    [loadMons]
  );

  const { status, scanned } = useTwitchChat({
    channel: TWITCH_CHANNEL,
    triggers,
    onMatch: handleMatch,
  });

  const stats = useMemo(() => {
    const spots = mons.reduce((acc, m) => acc + m.spotted_count, 0);
    const inReview = Object.values(pending).reduce((a, b) => a + b, 0);
    return { species: mons.length, spots, inReview };
  }, [mons, pending]);

  const latest = useMemo(() => {
    if (mons.length === 0) return null;
    return [...mons].sort((a, b) => (b.last_spotted_at > a.last_spotted_at ? 1 : -1))[0];
  }, [mons]);

  const selected = useMemo(() => mons.find((m) => m.id === selectedId) ?? null, [mons, selectedId]);

  const statusLabel =
    status === "live" ? `LIVE · #${TWITCH_CHANNEL}` : status === "connecting" ? "CONNECTING…" : status === "reconnecting" ? "RECONNECTING…" : "OFFLINE";

  return (
    <div className="flex min-h-screen flex-col">
      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="led led-blue" />
              <span className="led led-red" />
              <span className="led led-yellow" />
            </div>
            <h1 className="font-pixel text-sm text-foreground sm:text-base">
              LILLI<span className="text-primary">PEDEX</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              aria-label={muted ? "Unmute discovery sounds" : "Mute discovery sounds"}
              className="rounded-md border border-border p-2 text-muted-foreground transition hover:text-foreground"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-pokedex-cyan" />}
            </button>
            <a
              href={`https://twitch.tv/${TWITCH_CHANNEL}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 transition hover:border-primary/50"
            >
              <span className={`pulse-dot ${status === "live" ? "" : "err"}`} />
              <span className="font-lcd hidden text-sm text-foreground sm:inline">{statusLabel}</span>
              <span className="font-lcd text-sm text-foreground sm:hidden">LIVE</span>
            </a>
          </div>
        </div>
      </header>

      {/* ---------- main ---------- */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6">
        {setupError && (
          <Alert variant="destructive" className="mb-6">
            <Activity className="h-4 w-4" />
            <AlertTitle className="font-lcd">Connection issue</AlertTitle>
            <AlertDescription className="font-lcd text-sm">{setupError}</AlertDescription>
          </Alert>
        )}

        {/* hero LCD */}
        <section className="crt-screen relative mb-8 rounded-2xl px-5 py-8 sm:px-8 sm:py-10">
          <div className="radar-line" />
          <div className="relative z-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div className="space-y-3">
              <p className="font-lcd text-sm text-pokedex-cyan">
                <span className="lcd-text">SCANNING</span> twitch.tv/{TWITCH_CHANNEL} chat…
              </p>
              <h2 className="font-pixel max-w-xl text-lg leading-relaxed text-foreground sm:text-xl">
                EVERY <span className="text-primary">MON</span> SHOUTED IN CHAT
                <br />
                GETS CATALOGUED HERE
              </h2>
              <div className="flex flex-wrap gap-2 pt-1">
                {triggers.map((t) => (
                  <Badge key={t} variant="secondary" className="border border-pokedex-yellow/40 bg-pokedex-yellow/10 font-lcd text-[13px] text-pokedex-yellow">
                    &ldquo;{t}&rdquo;
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid w-full grid-cols-3 gap-3 sm:w-auto">
              <Stat label="SPECIES" value={loading ? "…" : formatNumber(stats.species)} />
              <Stat label="SPOTTED" value={loading ? "…" : formatNumber(stats.spots)} />
              <Stat label="IN REVIEW" value={loading ? "…" : formatNumber(stats.inReview)} />
            </div>
          </div>
          {latest && (
            <div className="relative z-10 mt-6 flex flex-wrap items-center gap-2 font-lcd text-sm text-muted-foreground">
              <Radio className="h-4 w-4 text-pokedex-cyan" />
              latest activity:
              <span className="text-foreground">{displayName(latest.name)}</span>
              {latest.last_spotted_by && <span>spotted by @{latest.last_spotted_by}</span>}
              <span className="text-pokedex-cyan">· {formatNumber(scanned)} chat messages scanned by you</span>
            </div>
          )}
        </section>

        {/* discovery toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2" role="status" aria-live="polite">
            <div className="pixel-card flex items-center gap-3 rounded-xl bg-popover px-5 py-4">
              {toast.isNew ? <span className="led led-green" /> : <span className="led led-blue" />}
              <div>
                {toast.isNew ? (
                  <p className="font-pixel text-[11px] text-pokedex-yellow">
                    NEW SPECIES DISCOVERED!
                  </p>
                ) : (
                  <p className="font-pixel text-[11px] text-pokedex-cyan">SPOTTED!</p>
                )}
                <p className="font-lcd text-sm text-foreground">
                  {displayName(toast.name)} {toast.isNew ? `— found by @${toast.by}` : "chat went wild"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* grid */}
        <section aria-label="Pokedex entries" className="mb-12">
          <h2 className="font-pixel mb-4 text-xs uppercase text-muted-foreground">
            <BookOpen className="mr-2 inline h-4 w-4 text-primary" />
            Dex entries — {stats.species}
          </h2>
          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-xl bg-secondary" />
              ))}
            </div>
          ) : mons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-12 text-center">
              <p className="font-pixel text-xs text-muted-foreground">NO SPECIES YET</p>
              <p className="font-lcd mt-2 text-base text-muted-foreground">
                Someone just has to type <span className="text-pokedex-yellow">{triggers.join(", ")}</span> in {TWITCH_CHANNEL}&apos;s chat!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mons.map((mon) => (
                <MonCard
                  key={mon.id}
                  mon={mon}
                  pendingCount={pending[mon.id] ?? 0}
                  onClick={() => setSelectedId(mon.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* how it works + safety */}
        <section className="grid gap-4 sm:grid-cols-3">
          <InfoCard
            icon={<Radio className="h-5 w-5 text-pokedex-cyan" />}
            title="LIVE LISTENING"
            body={`This page is connected to #${TWITCH_CHANNEL}'s Twitch chat around the clock. Whenever someone types a creature's name — like "sillymon_" — the species is registered and its spotted counter grows.`}
          />
          <InfoCard
            icon={<FlaskConical className="h-5 w-5 text-pokedex-yellow" />}
            title="COMMUNITY RESEARCH"
            body="Open any entry and propose a description or artwork. Give yourself a nickname for credit — it appears on the entry once approved."
          />
          <InfoCard
            icon={<ShieldCheck className="h-5 w-5 text-primary" />}
            title="SAFE BY DESIGN"
            body="Submissions pass a word filter and land in a review queue. Nothing is published until the channel team approves it. Images are size/type-checked and stored privately until approved."
          />
        </section>
      </main>

      {/* ---------- footer ---------- */}
      <footer className="mt-auto border-t border-border bg-secondary/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row">
            <div className="space-y-2">
              <p className="font-pixel text-[11px] text-foreground">
                LILLI<span className="text-primary">PEDEX</span> — made with{" "}
                <Heart className="inline h-3 w-3 text-primary" fill="currentColor" /> for the lillimon_ community
              </p>
              <p className="font-lcd text-sm text-muted-foreground">
                A living encyclopedia the whole chat builds together — one shout at a time.
              </p>
            </div>
            <nav aria-label="Links" className="font-lcd grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
              <a className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground" href={`https://twitch.tv/${TWITCH_CHANNEL}`} target="_blank" rel="noopener noreferrer">
                Twitch channel <ExternalLink className="h-3 w-3" />
              </a>
              <Button asChild variant="ghost" className="h-auto justify-start p-0 font-lcd text-sm text-muted-foreground hover:bg-transparent hover:text-foreground">
                <a href={`${BASE_PATH}/admin/`} className="flex items-center gap-1.5">
                  Team login <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </nav>
          </div>
        </div>
      </footer>

      <MonDetailDialog
        mon={selected}
        pendingCount={selected ? (pending[selected.id] ?? 0) : 0}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-pokedex-cyan/25 bg-black/40 px-4 py-3 text-center shadow-[inset_0_0_12px_#000000aa]">
      <p className="font-pixel text-sm text-pokedex-cyan sm:text-base">{value}</p>
      <p className="font-lcd mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function InfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="font-pixel text-[11px] text-foreground">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
