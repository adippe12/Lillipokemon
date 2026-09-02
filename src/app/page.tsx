"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { supabase, supabaseConfigured, publicImageUrl } from "@/lib/supabase";
import {
  type Mon,
  TWITCH_CHANNEL,
  DEFAULT_TRIGGERS,
  DEFAULT_RESERVED,
  displayName,
  formatNumber,
} from "@/lib/mons";
import { useTwitchChat, type ChatMessage } from "@/lib/use-twitch-chat";
import { ListenerStatus } from "@/components/listener-status";
import { MonCard } from "@/components/mon-card";
import { MonDetailDialog } from "@/components/mon-detail";
import { MonSprite } from "@/components/mon-sprite";
import { LiveWire, type FeedEvent } from "@/components/live-wire";
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  RotateCcw,
  Search,
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

// ---- hero typewriter: cycles through playful example species ----
const EXAMPLE_WORDS = ["blobmon", "noodlemon", "grumpymon", "chaosmon", "teacupmon"];

function useTypewriter(words: string[]): string {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const t = setTimeout(() => setTyped(words[0]), 0);
      return () => clearTimeout(t);
    }
    let i = 0;
    let pos = 0;
    let dir = 1;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const word = words[i % words.length];
      pos += dir;
      setTyped(word.slice(0, Math.max(0, pos)));
      let delay = dir > 0 ? 110 : 40;
      if (dir > 0 && pos >= word.length) {
        dir = -1;
        delay = 1500;
      } else if (dir < 0 && pos <= 0) {
        dir = 1;
        i += 1;
        delay = 400;
      }
      timer = setTimeout(step, delay);
    };
    timer = setTimeout(step, 700);
    return () => clearTimeout(timer);
  }, [words]);
  return typed;
}

// ---- animated number (count-up on change, reduced-motion aware) ----
function useCountUp(target: number, duration = 700): number {
  const [val, setVal] = useState(target);
  const prevRef = useRef(target);
  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;
    if (from === target) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => setVal(target));
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

type SortKey = "dex" | "spotted" | "recent" | "newest";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "dex", label: "DEX #" },
  { key: "spotted", label: "MOST SPOTTED" },
  { key: "recent", label: "RECENT" },
  { key: "newest", label: "NEWEST" },
];

const SPOT_TOAST_COOLDOWN = 10_000;
const SPOT_BLIP_COOLDOWN = 4_000;

export default function PokedexPage() {
  const [triggers, setTriggers] = useState<string[]>(DEFAULT_TRIGGERS);
  const [reserved, setReserved] = useState<string[]>(DEFAULT_RESERVED);
  const [mons, setMons] = useState<Mon[]>([]);
  const [pending, setPending] = useState<Record<string, number>>({});
  const [setupError, setSetupError] = useState<string | null>(
    supabaseConfigured ? null : "The Pokedex archives are not linked yet."
  );
  const [loading, setLoading] = useState(supabaseConfigured);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ name: string; isNew: boolean; by: string; ts: number } | null>(null);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("dex");
  const [hash, setHash] = useState("");

  const celebrated = useRef<Set<string>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countsRef = useRef<Record<string, number>>({});
  const lastSpotToastRef = useRef(0);
  const lastSpotBlipRef = useRef(0);
  const mutedRef = useRef(false);

  const showToast = useCallback((name: string, isNew: boolean, by: string) => {
    setToast({ name, isNew, by, ts: Date.now() });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), isNew ? 5200 : 4200);
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
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  const toggleMute = () => {
    try {
      localStorage.setItem("lp_muted", muted ? "0" : "1");
      muteListeners.forEach((l) => l());
    } catch {
      /* storage unavailable */
    }
  };

  // ---- live wire feed (dedup by id within a short window) ----
  const addFeed = useCallback((ev: FeedEvent) => {
    setFeed((prev) => {
      const now = Date.now();
      if (prev.some((e) => e.id === ev.id && now - e.ts < 25_000)) return prev;
      const next = [{ ...ev, ts: ev.ts || now }, ...prev];
      return next.slice(0, 30);
    });
  }, []);

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
    const rows = (data ?? []) as Mon[];
    setMons(rows);
    const map: Record<string, number> = {};
    for (const m of rows) map[m.id] = Number(m.spotted_count);
    countsRef.current = map;
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

  const retryConnection = useCallback(async () => {
    setSetupError(null);
    setLoading(true);
    try {
      await Promise.all([loadMons(), loadPending()]);
    } finally {
      setLoading(false);
    }
  }, [loadMons, loadPending]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    (async () => {
      await Promise.all([loadMons(), loadPending()]);
      setLoading(false);
    })().catch(() => setLoading(false));

    // triggers + reserved words (open matching blocklist)
    supabase
      .from("mon_triggers")
      .select("word")
      .then(({ data }) => {
        const words = (data ?? []).map((r: { word: string }) => r.word);
        if (words.length) setTriggers(words);
      });
    supabase
      .from("reserved_words")
      .select("word")
      .then(({ data }) => {
        const words = (data ?? []).map((r: { word: string }) => r.word);
        if (words.length) setReserved(words);
      });

    // realtime
    const channel = supabase
      .channel("lillipokedex-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mons" },
        (payload) => {
          const mon = payload.new as Mon;
          countsRef.current[mon.id] = Number(mon.spotted_count);
          void loadMons();
          void loadPending();
          if (!celebrated.current.has(mon.id)) {
            celebrated.current.add(mon.id);
            showToast(mon.name, true, mon.discovered_by);
            if (!mutedRef.current) blip("new");
            celebrate();
          }
          addFeed({ id: `new:${mon.id}`, kind: "new", name: mon.name, by: mon.discovered_by, ts: Date.now() });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "mons" },
        (payload) => {
          const mon = payload.new as Mon;
          const prevCount = countsRef.current[mon.id];
          const newCount = Number(mon.spotted_count);
          countsRef.current[mon.id] = newCount;
          void loadMons();
          if (prevCount !== undefined && newCount > prevCount) {
            const by = mon.last_spotted_by || "chat";
            addFeed({ id: `spot:${mon.name}:${by}`, kind: "spot", name: mon.name, by, ts: Date.now() });
            const now = Date.now();
            if (now - lastSpotBlipRef.current > SPOT_BLIP_COOLDOWN) {
              lastSpotBlipRef.current = now;
              if (!mutedRef.current) blip("spot");
            }
            if (now - lastSpotToastRef.current > SPOT_TOAST_COOLDOWN) {
              lastSpotToastRef.current = now;
              showToast(mon.name, false, by);
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "mons" },
        (payload) => {
          const old = payload.old as { id: string };
          celebrated.current.delete(old.id);
          delete countsRef.current[old.id];
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
  }, [loadMons, loadPending, showToast, addFeed]);

  // ---- twitch chat discovery ----
  const handleMatch = useCallback(
    async (msg: ChatMessage, canonical: string) => {
      if (!supabaseConfigured) return;
      const by = msg.displayName || msg.user;
      const { error } = await supabase.rpc("discover_mon", {
        p_name: canonical,
        p_by: by,
      });
      if (!error) {
        // instant feedback while the DB roundtrip catches up (deduped vs realtime UPDATE)
        addFeed({ id: `spot:${canonical}:${by}`, kind: "spot", name: canonical, by, ts: Date.now() });
        void loadMons();
      }
    },
    [loadMons, addFeed]
  );

  const { status, scanned } = useTwitchChat({
    channel: TWITCH_CHANNEL,
    triggers,
    reserved,
    onMatch: handleMatch,
  });

  // ---- deep links: #mon-<name> opens the entry dialog ----
  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    onHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const m = /^#mon-([a-z0-9_]+)$/i.exec(hash);
    const targetName = m ? m[1].toLowerCase() : null;
    if (targetName) {
      const found = mons.find((x) => x.name === targetName);
      if (found && found.id !== selectedId) setSelectedId(found.id);
    } else if (!hash && selectedId) {
      setSelectedId(null);
    }
  }, [hash, mons, selectedId]);

  const openMon = useCallback(
    (id: string) => {
      const mon = mons.find((m) => m.id === id);
      setSelectedId(id);
      if (mon) {
        window.history.replaceState(null, "", `#mon-${mon.name}`);
        setHash(`#mon-${mon.name}`);
      }
    },
    [mons]
  );

  const closeMon = useCallback(() => {
    setSelectedId(null);
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
      setHash("");
    }
  }, []);

  // ---- derived data ----
  const stats = useMemo(() => {
    const spots = mons.reduce((acc, m) => acc + m.spotted_count, 0);
    const inReview = Object.values(pending).reduce((a, b) => a + b, 0);
    return { species: mons.length, spots, inReview };
  }, [mons, pending]);

  const latest = useMemo(() => {
    if (mons.length === 0) return null;
    return [...mons].sort((a, b) => (b.last_spotted_at > a.last_spotted_at ? 1 : -1))[0];
  }, [mons]);

  const maxSpotted = useMemo(
    () => mons.reduce((a, m) => Math.max(a, m.spotted_count), 0),
    [mons]
  );

  const selected = useMemo(() => mons.find((m) => m.id === selectedId) ?? null, [mons, selectedId]);

  const visibleMons = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#/, "");
    const list = q
      ? mons.filter(
          (m) =>
            m.name.includes(q) ||
            displayName(m.name).toLowerCase().includes(q) ||
            (m.discovered_by || "").toLowerCase().includes(q)
        )
      : mons;
    const sorted = [...list];
    switch (sort) {
      case "spotted":
        sorted.sort((a, b) => b.spotted_count - a.spotted_count);
        break;
      case "recent":
        sorted.sort((a, b) => (b.last_spotted_at > a.last_spotted_at ? 1 : -1));
        break;
      case "newest":
        sorted.sort((a, b) => (b.discovered_at > a.discovered_at ? 1 : -1));
        break;
      default:
        sorted.sort((a, b) => a.pokedex_no - b.pokedex_no);
    }
    return sorted;
  }, [mons, query, sort]);

  const isFiltering = query.trim() !== "" || sort !== "dex";
  const typed = useTypewriter(EXAMPLE_WORDS);

  const statusLabel =
    status === "live" ? `LIVE · #${TWITCH_CHANNEL}` : status === "connecting" ? "CONNECTING…" : status === "reconnecting" ? "RECONNECTING…" : "OFFLINE";

  const toastMon = useMemo(
    () => (toast ? mons.find((m) => m.name === toast.name) ?? null : null),
    [toast, mons]
  );

  return (
    <div className="flex min-h-screen flex-col">
      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <a
            href="/"
            className="flex items-center gap-3 rounded-md transition hover:opacity-90"
            aria-label="LILLIPEDEX home"
          >
            <div className="flex items-center gap-1.5" aria-hidden>
              <span className="led led-blue" />
              <span className="led led-red" />
              <span className="led led-yellow" />
            </div>
            <h1 className="font-pixel text-sm text-foreground sm:text-base">
              LILLI<span className="text-primary">PEDEX</span>
            </h1>
          </a>
          <div className="flex items-center gap-2">
            <ListenerStatus />
            <button
              onClick={toggleMute}
              aria-label={muted ? "Unmute discovery sounds" : "Mute discovery sounds"}
              aria-pressed={muted}
              className="rounded-md border border-border p-2 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
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
            <AlertDescription className="font-lcd text-sm">
              {setupError}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void retryConnection()}
                className="font-lcd ml-0 mt-2 flex items-center gap-1.5 sm:ml-3 sm:mt-0"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* hero + live wire */}
        <section className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="crt-screen relative rounded-2xl px-5 py-8 sm:px-8 sm:py-10">
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
                <p className="font-lcd text-base text-muted-foreground" aria-hidden>
                  try: <span className="text-pokedex-yellow">{typed}</span>
                  <span className="caret" />
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge className="border border-pokedex-cyan/50 bg-pokedex-cyan/15 font-lcd text-[13px] text-pokedex-cyan">
                    ANY word ending in &ldquo;mon&rdquo;
                  </Badge>
                  {triggers.slice(0, 5).map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="border border-pokedex-yellow/40 bg-pokedex-yellow/10 font-lcd text-[13px] text-pokedex-yellow"
                    >
                      &ldquo;{t}&rdquo;
                    </Badge>
                  ))}
                  {triggers.length > 5 && (
                    <span className="font-lcd text-xs text-muted-foreground">+{triggers.length - 5}</span>
                  )}
                </div>
              </div>
              <div className="grid w-full grid-cols-3 gap-3 sm:w-auto">
                <Stat label="SPECIES" value={loading ? null : stats.species} />
                <Stat label="SPOTTED" value={loading ? null : stats.spots} />
                <Stat label="IN REVIEW" value={loading ? null : stats.inReview} />
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
          </div>

          <LiveWire events={feed} className="min-h-44" />
        </section>

        {/* discovery toast */}
        {toast && (
          <div className="anim-toast fixed bottom-6 z-50" role="status" aria-live="polite">
            <button
              onClick={() => {
                if (toastMon) openMon(toastMon.id);
                setToast(null);
              }}
              className="pixel-card relative flex items-center gap-3 overflow-hidden rounded-xl bg-popover px-5 py-4 pr-7 text-left transition hover:border-pokedex-cyan/40"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#101a1f] shadow-[inset_0_0_12px_#000000aa]">
                {toastMon ? (
                  toastMon.image_path ? (
                    <img
                      src={publicImageUrl(toastMon.image_path)}
                      alt={`${toastMon.name} artwork`}
                      className="h-9 w-9 rounded object-contain"
                    />
                  ) : (
                    <MonSprite name={toast.name} seed={toastMon.id.slice(0, 8)} size={36} />
                  )
                ) : (
                  <MonSprite name={toast.name} seed={toast.name} size={36} />
                )}
              </div>
              <div>
                {toast.isNew ? (
                  <p className="font-pixel text-[11px] text-pokedex-yellow">NEW SPECIES DISCOVERED!</p>
                ) : (
                  <p className="font-pixel text-[11px] text-pokedex-cyan">SPOTTED!</p>
                )}
                <p className="font-lcd text-sm text-foreground">
                  {displayName(toast.name)}{" "}
                  {toast.isNew ? `— found by @${toast.by}` : `— spotted by @${toast.by}`}
                </p>
                <p className="font-lcd text-[11px] text-muted-foreground">click to open the entry</p>
              </div>
              <span
                key={toast.ts}
                aria-hidden
                className="toast-timer-bar absolute bottom-0 left-0 h-[3px] bg-pokedex-cyan/50"
              />
            </button>
          </div>
        )}

        {/* grid */}
        <section aria-label="Pokedex entries" className="mb-12">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-pixel mb-0 text-xs uppercase text-muted-foreground">
              <BookOpen className="mr-2 inline h-4 w-4 text-primary" />
              Dex entries — {stats.species}
            </h2>
            {query.trim() !== "" && (
              <span className="font-lcd text-xs text-muted-foreground">
                showing {visibleMons.length} of {mons.length}
              </span>
            )}
          </div>

          {mons.length > 0 && (
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search species or discoverer…"
                  aria-label="Search species or discoverer"
                  className="font-lcd bg-secondary/60 pl-9"
                />
              </div>
              <div
                className="flex items-center gap-1 self-start overflow-x-auto rounded-lg border border-border bg-secondary/50 p-1"
                role="group"
                aria-label="Sort entries"
              >
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSort(s.key)}
                    aria-pressed={sort === s.key}
                    className={`font-lcd whitespace-nowrap rounded-md border px-3 py-1.5 text-sm transition ${
                      sort === s.key
                        ? "border-primary/40 bg-card text-foreground shadow-sm"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-64 rounded-xl bg-secondary" />
              ))}
            </div>
          ) : mons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-12 text-center">
              <div className="mb-6 flex items-end justify-center gap-5" aria-hidden>
                {EXAMPLE_WORDS.slice(0, 3).map((w, i) => (
                  <div
                    key={w}
                    className="floaty flex flex-col items-center gap-2"
                    style={{ animationDelay: `${i * 300}ms`, opacity: 0.9 }}
                  >
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-[#101a1f] shadow-[inset_0_0_14px_#000000aa]">
                      <MonSprite name={w} seed={w} size={52} />
                    </div>
                    <span className="font-lcd text-xs text-muted-foreground">{w}</span>
                  </div>
                ))}
              </div>
              <p className="font-pixel text-xs text-muted-foreground">NO SPECIES YET</p>
              <p className="font-lcd mt-2 text-base text-muted-foreground">
                Type <span className="text-pokedex-yellow">ANY word ending in &ldquo;mon&rdquo;</span> in{" "}
                {TWITCH_CHANNEL}&apos;s chat — blobmon, gutmon, whatevermon!
              </p>
            </div>
          ) : visibleMons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-10 text-center">
              <p className="font-lcd text-base text-muted-foreground">
                No species match <span className="text-pokedex-yellow">&ldquo;{query.trim()}&rdquo;</span>
              </p>
              <Button variant="secondary" className="font-lcd mt-3" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleMons.map((mon, i) => (
                <MonCard
                  key={mon.id}
                  mon={mon}
                  pendingCount={pending[mon.id] ?? 0}
                  index={i}
                  onClick={() => openMon(mon.id)}
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
            body={`A 24/7 cloud listener watches #${TWITCH_CHANNEL}'s chat even when nobody has this site open. ANY word ending in "mon" — like "sillymon_" or a brand-new "blobmon" — becomes a species and its spotted counter grows. Opening this page adds a second pair of eyes, with live celebrations.`}
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
                <a href="/admin/" className="flex items-center gap-1.5">
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
        maxSpotted={maxSpotted}
        onOpenChange={(open) => {
          if (!open) closeMon();
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  const v = useCountUp(value ?? 0);
  return (
    <div className="rounded-lg border border-pokedex-cyan/25 bg-black/40 px-4 py-3 text-center shadow-[inset_0_0_12px_#000000aa]">
      <p className="font-pixel text-sm text-pokedex-cyan sm:text-base">
        {value === null ? "…" : formatNumber(v)}
      </p>
      <p className="font-lcd mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function InfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 transition duration-200 hover:-translate-y-0.5 hover:border-primary/30">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="font-pixel text-[11px] text-foreground">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
