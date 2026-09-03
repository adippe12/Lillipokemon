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
  relativeTime,
} from "@/lib/mons";
import { useTwitchChat, type ChatMessage } from "@/lib/use-twitch-chat";
import { ListenerStatus } from "@/components/listener-status";
import { MonCard } from "@/components/mon-card";
import { MonDetailDialog } from "@/components/mon-detail";
import { MonSprite, spriteBubbleBg } from "@/components/mon-sprite";
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
  Info,
  RotateCcw,
  Search,
  Sparkles,
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
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.03, now + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.16);
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
  const colors = ["#f06ba8", "#b9a7f2", "#7fd8be", "#ffd97d", "#8ecdf7"];
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.7 }, colors, disableForReducedMotion: true, scalar: 0.9 });
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
// suggestions always follow the adjective+mon pattern: crazymon, latemon, luckymon
const EXAMPLE_WORDS = ["crazymon", "latemon", "luckymon"];

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
  { key: "dex", label: "Dex #" },
  { key: "spotted", label: "Most spotted" },
  { key: "recent", label: "Recent" },
  { key: "newest", label: "Newest" },
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

  // ---- twitch chat mirror (READ-ONLY) ----
  // The 24/7 cloud worker is the SINGLE writer to Supabase. The browser only
  // mirrors the chat locally: a local match gives instant CHAT BUZZ feedback,
  // deduped against the realtime UPDATE that arrives a moment later from the
  // worker's report (same event id, 25s window).
  const handleMatch = useCallback(
    (msg: ChatMessage, canonical: string) => {
      const by = msg.displayName || msg.user;
      addFeed({ id: `spot:${canonical}:${by}`, kind: "spot", name: canonical, by, ts: Date.now() });
    },
    [addFeed]
  );

  const { status } = useTwitchChat({
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
    const inReview = Object.values(pending).reduce((a, b) => a + b, 0);
    return { species: mons.length, inReview };
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
    status === "live" ? `LIVE · #${TWITCH_CHANNEL}` : status === "connecting" ? "connecting…" : status === "reconnecting" ? "reconnecting…" : "offline";

  const toastMon = useMemo(
    () => (toast ? mons.find((m) => m.name === toast.name) ?? null : null),
    [toast, mons]
  );

  return (
    <div className="flex min-h-screen flex-col">
      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 shadow-[0_2px_18px_rgba(240,107,168,0.07)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          <a
            href="/"
            className="flex items-center gap-2.5 rounded-full transition hover:opacity-90"
            aria-label="LILLIPEDEX home"
          >
            <span className="flex items-end gap-1" aria-hidden>
              <Heart className="h-4 w-4 text-primary" fill="currentColor" />
              <Heart className="h-3 w-3 text-[#b9a7f2]" fill="currentColor" />
              <Heart className="h-2.5 w-2.5 text-[#7fd8be]" fill="currentColor" />
            </span>
            <h1 className="font-display text-lg font-extrabold tracking-wide text-foreground sm:text-xl">
              LILLI<span className="text-primary">PEDEX</span>
            </h1>
          </a>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <ListenerStatus />
            <a
              href="/info/"
              aria-label="How this dex works"
              title="How this dex works"
              className="rounded-full border border-border bg-card p-2 text-muted-foreground shadow-[0_2px_8px_rgba(240,107,168,0.08)] transition hover:border-primary/40 hover:text-primary"
            >
              <Info className="h-4 w-4" />
            </a>
            <button
              onClick={toggleMute}
              aria-label={muted ? "Unmute discovery sounds" : "Mute discovery sounds"}
              aria-pressed={muted}
              className="rounded-full border border-border bg-card p-2 text-muted-foreground shadow-[0_2px_8px_rgba(240,107,168,0.08)] transition hover:border-primary/40 hover:text-primary"
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4 text-primary" />}
            </button>
            <a
              href={`https://twitch.tv/${TWITCH_CHANNEL}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full border border-primary/25 bg-card px-2.5 py-1.5 shadow-[0_2px_8px_rgba(240,107,168,0.08)] transition hover:border-primary/50 sm:px-3"
            >
              <span className={`pulse-dot ${status === "live" ? "" : "err"}`} />
              <span className="font-soft hidden text-sm font-bold text-foreground sm:inline">{statusLabel}</span>
              <span className="font-soft text-sm font-bold text-foreground sm:hidden">LIVE</span>
            </a>
          </div>
        </div>
      </header>

      {/* ---------- main ---------- */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6">
        {setupError && (
          <Alert variant="destructive" className="mb-6">
            <Activity className="h-4 w-4" />
            <AlertTitle className="font-soft font-bold">Oh no, a connection hiccup</AlertTitle>
            <AlertDescription className="font-soft text-sm">
              {setupError}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void retryConnection()}
                className="font-soft ml-0 mt-2 flex items-center gap-1.5 sm:ml-3 sm:mt-0"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* hero — compact: the mons are the stars */}
        <section className="mb-4">
          <div className="cloud-panel relative rounded-3xl px-5 py-6 sm:px-8 sm:py-8">
            {/* floating pastel bubbles */}
            <span className="bubble bubble-pink bob" style={{ width: 92, height: 92, top: -26, right: 70 }} aria-hidden />
            <span className="bubble bubble-lavender bob" style={{ width: 54, height: 54, top: 44, right: -12, animationDelay: "1.2s" }} aria-hidden />
            <span className="bubble bubble-mint bob" style={{ width: 42, height: 42, bottom: 30, left: -12, animationDelay: "2s" }} aria-hidden />
            <span className="bubble bubble-butter bob" style={{ width: 30, height: 30, top: 14, left: 150, animationDelay: "0.6s" }} aria-hidden />
            <span className="bubble bubble-sky bob" style={{ width: 48, height: 48, bottom: -14, right: 210, animationDelay: "2.6s" }} aria-hidden />
            <div className="relative z-10 flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
              <div className="min-w-0 space-y-2.5">
                <p className="font-soft text-sm font-bold text-primary">
                  <Sparkles className="mr-1 inline h-4 w-4" aria-hidden />
                  listening to twitch.tv/{TWITCH_CHANNEL} chat…
                </p>
                <h2 className="font-display max-w-xl text-xl font-extrabold leading-snug text-foreground sm:text-2xl">
                  Every little <span className="text-primary">mon</span> typed in chat
                  <br className="hidden sm:block" /> becomes a new mon here
                </h2>
                <p className="font-soft text-base font-semibold text-muted-foreground" aria-hidden>
                  try: <span className="font-bold text-primary">{typed}</span>
                  <span className="caret" />
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                  <Badge className="rounded-full border border-primary/40 bg-primary/15 font-soft text-[13px] font-bold text-primary">
                    any word ending in &ldquo;mon&rdquo;
                  </Badge>
                  {triggers.slice(0, 5).map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="rounded-full border border-[#b9a7f2]/50 bg-[#b9a7f2]/15 font-soft text-[13px] font-bold text-[#8a6fd1]"
                    >
                      &ldquo;{t}&rdquo;
                    </Badge>
                  ))}
                  {triggers.length > 5 && (
                    <span className="font-soft text-xs font-bold text-muted-foreground">+{triggers.length - 5}</span>
                  )}
                </div>
              </div>
              <SpotlightMon mon={loading ? null : latest} onOpen={openMon} />
            </div>
          </div>
        </section>

        {/* stat pills + chat buzz ticker */}
        <section aria-label="Dex stats and live activity" className="mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <StatPill
              icon={<Heart className="h-4 w-4 text-primary" />}
              label="mons"
              value={loading ? null : stats.species}
            />
            <StatPill
              icon={<FlaskConical className="h-4 w-4 text-[#8a6fd1]" />}
              label="in review"
              value={loading ? null : stats.inReview}
            />
          </div>
          <LiveWire events={feed} />
        </section>

        {/* discovery toast */}
        {toast && (
          <div className="anim-toast fixed bottom-6 z-50 w-max max-w-[calc(100vw-2.5rem)]" role="status" aria-live="polite">
            <button
              onClick={() => {
                if (toastMon) openMon(toastMon.id);
                setToast(null);
              }}
              className="candy-card relative flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-2xl bg-popover px-5 py-4 pr-7 text-left"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-[0_4px_10px_rgba(240,107,168,0.15)]"
                style={{ background: toastMon ? spriteBubbleBg(toastMon.name, toastMon.id.slice(0, 8)) : "#fdeff5" }}
              >
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
                  <p className="font-display text-xs font-extrabold text-primary">NEW MON DISCOVERED!</p>
                ) : (
                  <p className="font-display text-xs font-extrabold text-pokedex-cyan">SPOTTED AGAIN!</p>
                )}
                <p className="font-soft truncate text-sm font-bold text-foreground">
                  {displayName(toast.name)}{" "}
                  {toast.isNew ? `— found by @${toast.by}` : `— spotted by @${toast.by}`}
                </p>
                <p className="font-soft text-[11px] font-semibold text-muted-foreground">tap to open the entry</p>
              </div>
              <span
                key={toast.ts}
                aria-hidden
                className="toast-timer-bar absolute bottom-0 left-0 h-[3px] bg-primary/50"
              />
            </button>
          </div>
        )}

        {/* grid */}
        <section aria-label="Pokedex entries" className="mb-8">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display mb-0 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <BookOpen className="mr-2 inline h-4 w-4 text-primary" />
              Dex mons — {stats.species}
            </h2>
            {query.trim() !== "" && (
              <span className="font-soft text-xs font-bold text-muted-foreground">
                showing {visibleMons.length} of {mons.length}
              </span>
            )}
          </div>

          {mons.length > 0 && (
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-xs">
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search species or discoverer…"
                  aria-label="Search species or discoverer"
                  className="font-soft rounded-full border-border bg-card pl-9 font-semibold shadow-[0_2px_8px_rgba(240,107,168,0.06)]"
                />
              </div>
              <div
                className="flex items-center gap-1 self-start overflow-x-auto rounded-full border border-border bg-card/80 p-1 shadow-[0_2px_8px_rgba(240,107,168,0.06)]"
                role="group"
                aria-label="Sort entries"
              >
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSort(s.key)}
                    aria-pressed={sort === s.key}
                    className={`font-soft whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold transition ${
                      sort === s.key
                        ? "bg-primary text-primary-foreground shadow-[0_3px_10px_rgba(240,107,168,0.35)]"
                        : "text-muted-foreground hover:text-foreground"
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
                <Skeleton key={i} className="h-64 rounded-3xl bg-secondary" />
              ))}
            </div>
          ) : mons.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-border bg-white/60 p-12 text-center">
              <div className="mb-6 flex items-end justify-center gap-6" aria-hidden>
                {EXAMPLE_WORDS.slice(0, 3).map((w, i) => (
                  <div
                    key={w}
                    className="floaty flex flex-col items-center gap-2"
                    style={{ animationDelay: `${i * 300}ms` }}
                  >
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white shadow-[0_6px_14px_rgba(240,107,168,0.14)]"
                      style={{ background: spriteBubbleBg(w, w) }}
                    >
                      <MonSprite name={w} seed={w} size={52} />
                    </div>
                    <span className="font-soft text-xs font-bold text-muted-foreground">{w}</span>
                  </div>
                ))}
              </div>
              <p className="font-display text-base font-bold text-foreground">No mons yet…</p>
              <p className="font-soft mt-2 text-base font-semibold text-muted-foreground">
                Type <span className="font-bold text-primary">any word ending in &ldquo;mon&rdquo;</span> in{" "}
                {TWITCH_CHANNEL}&apos;s chat — crazymon, latemon, luckymon!
              </p>
            </div>
          ) : visibleMons.length === 0 ? (
            <div className="rounded-3xl border-2 border-dashed border-border bg-white/60 p-10 text-center">
              <p className="font-soft text-base font-semibold text-muted-foreground">
                No species match <span className="font-bold text-primary">&ldquo;{query.trim()}&rdquo;</span>
              </p>
              <Button variant="secondary" className="font-soft mt-3 rounded-full font-bold" onClick={() => setQuery("")}>
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

        {/* pointer to the info page */}
        <section aria-label="More about the dex">
          <a
            href="/info/"
            className="font-soft group flex items-center justify-center gap-2 rounded-full border-2 border-border bg-white/80 px-5 py-3.5 text-center text-sm font-bold text-foreground shadow-[0_4px_14px_rgba(240,107,168,0.08)] transition hover:border-primary/40 hover:text-primary"
          >
            <BookOpen className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            Curious? See how mons are born, how to add research &amp; more
            <span aria-hidden className="text-primary transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </a>
        </section>
      </main>

      {/* ---------- footer ---------- */}
      <footer className="mt-auto border-t border-border/70 bg-white/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-8">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row">
            <div className="space-y-2">
              <p className="font-display text-sm font-extrabold text-foreground">
                LILLI<span className="text-primary">PEDEX</span> — made with{" "}
                <Heart className="inline h-3.5 w-3.5 text-primary" fill="currentColor" /> for the lillimon_ community
              </p>
              <p className="font-soft text-sm font-semibold text-muted-foreground">
                A living encyclopedia the whole chat builds together — one shout at a time.
              </p>
            </div>
            <nav aria-label="Links" className="font-soft flex max-w-full flex-wrap gap-x-6 gap-y-1.5 text-sm font-bold">
              <a className="flex items-center gap-1.5 text-muted-foreground transition hover:text-primary" href="/info/">
                How it works
              </a>
              <a className="flex items-center gap-1.5 text-muted-foreground transition hover:text-primary" href={`https://twitch.tv/${TWITCH_CHANNEL}`} target="_blank" rel="noopener noreferrer">
                Twitch channel <ExternalLink className="h-3 w-3" />
              </a>
              <Button asChild variant="ghost" className="h-auto justify-start p-0 font-soft text-sm font-bold text-muted-foreground hover:bg-transparent hover:text-primary">
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

function StatPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
}) {
  const v = useCountUp(value ?? 0);
  return (
    <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-white/90 px-2 py-2.5 shadow-[0_4px_14px_rgba(240,107,168,0.08)]">
      <span className="shrink-0" aria-hidden>
        {icon}
      </span>
      <p className="font-display whitespace-nowrap text-lg font-extrabold text-primary sm:text-xl">
        {value === null ? "…" : formatNumber(v)}
      </p>
      <p className="font-soft text-left text-[11px] leading-tight font-bold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  );
}

/** Cute spotlight card in the hero: the most recently spotted mon. */
function SpotlightMon({ mon, onOpen }: { mon: Mon | null; onOpen: (id: string) => void }) {
  if (!mon) {
    return (
      <div className="candy-card flex w-full flex-col items-center gap-2 rounded-3xl px-5 py-4 sm:w-[300px]" aria-hidden>
        <div className="flex items-center gap-4">
          {EXAMPLE_WORDS.slice(0, 3).map((w, i) => (
            <div
              key={w}
              className="floaty flex h-12 w-12 items-center justify-center rounded-full border-2 border-white shadow-[0_4px_10px_rgba(240,107,168,0.12)]"
              style={{ background: spriteBubbleBg(w, w), animationDelay: `${i * 300}ms` }}
            >
              <MonSprite name={w} seed={w} size={38} />
            </div>
          ))}
        </div>
        <p className="font-soft text-[11px] font-bold text-muted-foreground">mons will pop up here!</p>
      </div>
    );
  }
  const by = mon.last_spotted_by || mon.discovered_by;
  return (
    <button
      onClick={() => onOpen(mon.id)}
      className="candy-card group relative flex w-full shrink-0 items-center gap-3.5 rounded-3xl px-4 py-4 text-left sm:w-[300px]"
      aria-label={`Open ${mon.name} entry — the latest mon`}
    >
      <span className="font-display absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-[10px] font-bold whitespace-nowrap text-primary-foreground shadow-[0_2px_8px_rgba(240,107,168,0.4)]">
        LATEST MON
      </span>
      <div
        className="floaty flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-[0_4px_12px_rgba(240,107,168,0.14)]"
        style={{ background: spriteBubbleBg(mon.name, mon.id.slice(0, 8)) }}
      >
        {mon.image_path ? (
          <img
            src={publicImageUrl(mon.image_path)}
            alt={`${mon.name} artwork`}
            className="h-16 w-16 rounded object-contain"
          />
        ) : (
          <MonSprite name={mon.name} seed={mon.id.slice(0, 8)} size={70} />
        )}
      </div>
      <div className="min-w-0">
        <p className="font-display truncate text-lg font-bold text-foreground transition-colors group-hover:text-primary">
          {displayName(mon.name)}
        </p>
        <p className="font-soft truncate text-[13px] font-semibold text-muted-foreground">spotted by @{by}</p>
        <p className="font-soft text-xs font-bold text-primary">{relativeTime(mon.last_spotted_at, Date.now())}</p>
      </div>
    </button>
  );
}
