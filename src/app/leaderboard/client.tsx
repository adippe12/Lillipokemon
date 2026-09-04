"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured, publicImageUrl } from "@/lib/supabase";
import {
  type Mon,
  type Spotter,
  displayName,
  formatNumber,
  pokedexNumber,
  relativeTime,
} from "@/lib/mons";
import { MonSprite, spriteBubbleBg } from "@/components/mon-sprite";
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  BarChart3,
  FlaskConical,
  Heart,
  RefreshCw,
  Sparkles,
  Trophy,
} from "lucide-react";

const SHOW_PER_BOARD = 10;

export function LeaderboardClient() {
  const [loading, setLoading] = useState(true);
  const [spotters, setSpotters] = useState<Spotter[]>([]);
  const [mons, setMons] = useState<Mon[]>([]);

  const load = useCallback(async () => {
    const [{ data: sp }, { data: ms }] = await Promise.all([
      supabase
        .from("spotters")
        .select("*")
        .order("spots", { ascending: false })
        .limit(25),
      supabase.from("mons").select("*").order("spotted_count", { ascending: false }),
    ]);
    setSpotters((sp ?? []) as Spotter[]);
    setMons((ms ?? []) as Mon[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // initial fetch: setState fires only after the awaited queries resolve
    // (same async-loader pattern as admin/page.tsx) — the rule can't see
    // through the useCallback boundary, hence the targeted disable
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const channel = supabase
      .channel("leaderboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "spotters" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "mons" }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const discoverers = useMemo(() => tally(mons, (m) => [m.discovered_by]), [mons]);
  const researchers = useMemo(
    () =>
      tally(mons, (m) =>
        [m.description_by, m.image_by].filter(
          (n): n is string => Boolean(n) && n !== "team"
        )
      ),
    [mons]
  );
  const beloved = useMemo(
    () => [...mons].sort((a, b) => b.spotted_count - a.spotted_count).slice(0, SHOW_PER_BOARD),
    [mons]
  );

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <Alert>
          <AlertDescription className="font-soft text-sm font-semibold">
            Not configured.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 shadow-[0_2px_18px_rgba(240,107,168,0.07)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3">
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
          <div className="flex items-center gap-2">
            <a
              href="/stats/"
              aria-label="Dex statistics"
              title="Dex statistics"
              className="rounded-full border border-border bg-card p-2 text-muted-foreground shadow-[0_2px_8px_rgba(240,107,168,0.08)] transition hover:border-primary/40 hover:text-primary"
            >
              <BarChart3 className="h-4 w-4" />
            </a>
            <a
              href="/"
              className="font-soft flex shrink-0 items-center gap-2 rounded-full border border-primary/25 bg-card px-4 py-1.5 text-sm font-bold text-foreground shadow-[0_2px_8px_rgba(240,107,168,0.08)] transition hover:border-primary/50 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              back to the dex
            </a>
          </div>
        </div>
      </header>

      {/* ---------- main ---------- */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-16">
        {/* hero */}
        <div className="cloud-panel relative mb-6 rounded-3xl px-5 py-6 sm:px-8 sm:py-8">
          <span className="bubble bubble-butter bob" style={{ width: 56, height: 56, top: -16, right: 48 }} aria-hidden />
          <span className="bubble bubble-mint bob" style={{ width: 36, height: 36, bottom: 14, left: -8, animationDelay: "1.2s" }} aria-hidden />
          <div className="relative z-10">
            <p className="font-soft flex items-center gap-1.5 text-sm font-bold text-primary">
              <Trophy className="h-4 w-4" aria-hidden />
              the chat legends, updated live
            </p>
            <h2 className="font-display mt-2 text-2xl font-extrabold leading-snug text-foreground sm:text-3xl">
              Hall of <span className="text-primary">fame</span>
            </h2>
            <p className="font-soft mt-3 text-base leading-relaxed font-semibold text-muted-foreground">
              Every accepted chat mention, every brand-new species, every piece of
              research — it all adds up. These boards update in real time as
              lillimon_&apos;s chat plays.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* top spotters */}
          <Board
            icon={<Trophy className="h-5 w-5 text-primary" />}
            title="Top spotters"
            note="every accepted mention counts — live"
            loading={loading}
            rows={spotters.slice(0, SHOW_PER_BOARD)}
            emptyText="No spots on the board yet — per-spotter counting just started. Get in chat and say a mon!"
            renderRow={(s, i) => (
              <BoardRow
                key={s.name}
                i={i}
                left={
                  <>
                    <span className="font-display truncate text-sm font-extrabold text-foreground">
                      @{s.name}
                    </span>
                    <span className="font-soft hidden text-xs font-semibold text-muted-foreground sm:inline">
                      last seen {relativeTime(s.last_seen)}
                    </span>
                  </>
                }
                chip={`${formatNumber(s.spots)} spot${s.spots === 1 ? "" : "s"}`}
                chipClass="border-primary/25 bg-primary/10 text-primary"
              />
            )}
          />

          {/* top discoverers */}
          <Board
            icon={<Sparkles className="h-5 w-5 text-pokedex-yellow" />}
            title="Top discoverers"
            note="who brought the new species into the world"
            loading={loading}
            rows={discoverers.slice(0, SHOW_PER_BOARD)}
            emptyText="No species yet — type any “mon” word in chat to be the first."
            renderRow={(d, i) => (
              <BoardRow
                key={d.name}
                i={i}
                left={
                  <span className="font-display truncate text-sm font-extrabold text-foreground">
                    @{d.name}
                  </span>
                }
                chip={`${d.count} species`}
                chipClass="border-pokedex-yellow/30 bg-pokedex-yellow/10 text-pokedex-yellow"
              />
            )}
          />

          {/* top researchers */}
          <Board
            icon={<FlaskConical className="h-5 w-5 text-pokedex-cyan" />}
            title="Top researchers"
            note="approved descriptions & artwork credits"
            loading={loading}
            rows={researchers.slice(0, SHOW_PER_BOARD)}
            emptyText="No published research yet — open any mon and propose a description or artwork!"
            renderRow={(r, i) => (
              <BoardRow
                key={r.name}
                i={i}
                left={
                  <span className="font-display truncate text-sm font-extrabold text-foreground">
                    @{r.name}
                  </span>
                }
                chip={`${r.count} credit${r.count === 1 ? "" : "s"}`}
                chipClass="border-pokedex-cyan/30 bg-pokedex-cyan/10 text-pokedex-cyan"
              />
            )}
          />

          {/* most beloved */}
          <Board
            icon={<Heart className="h-5 w-5 text-primary" />}
            title="Most beloved mons"
            note="all-time spotted counter"
            loading={loading}
            rows={beloved}
            emptyText="No mons yet."
            renderRow={(m, i) => (
              <div key={m.id} className="flex items-center gap-3 py-1.5">
                <RankChip i={i} />
                <div
                  className="floaty flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-[0_3px_8px_rgba(240,107,168,0.12)]"
                  style={{ background: spriteBubbleBg(m.name, m.id.slice(0, 8)) }}
                >
                  {m.image_path ? (
                    <img
                      src={publicImageUrl(m.image_path)}
                      alt=""
                      className="h-9 w-9 object-contain"
                      loading="lazy"
                    />
                  ) : (
                    <MonSprite name={m.name} seed={m.id.slice(0, 8)} size={36} needsArt />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-display block truncate text-sm font-extrabold text-foreground">
                    {displayName(m.name)}
                  </span>
                  <span className="font-soft text-xs font-semibold text-muted-foreground">
                    {pokedexNumber(m.pokedex_no)} · discovered by @{m.discovered_by}
                  </span>
                </div>
                <span className="font-soft shrink-0 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-bold leading-none text-primary">
                  {formatNumber(m.spotted_count)} spotted
                </span>
              </div>
            )}
          />

          {/* back to dex */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <a
              href="/"
              className="font-soft flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[0_6px_18px_rgba(240,107,168,0.35)] transition hover:bg-[#d5518d]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              back to the dex — claim your spot!
            </a>
          </div>
        </div>
      </main>

      {/* ---------- footer ---------- */}
      <footer className="mt-auto border-t border-border/70 bg-white/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 text-center">
          <p className="font-soft text-sm font-semibold text-muted-foreground">
            LILLIPEDEX — made with <Heart className="inline h-3.5 w-3.5 text-primary" fill="currentColor" /> for
            the lillimon_ community
          </p>
        </div>
      </footer>
    </div>
  );
}

// ---------- helpers & bits ----------

function tally(mons: Mon[], namesOf: (m: Mon) => (string | null)[]) {
  const map = new Map<string, number>();
  for (const m of mons) {
    for (const n of namesOf(m)) {
      if (n) map.set(n, (map.get(n) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function RankChip({ i }: { i: number }) {
  const styles =
    i === 0
      ? "bg-[#f4b63f] text-white shadow-[0_2px_8px_rgba(244,182,63,0.45)]"
      : i === 1
        ? "bg-[#aebacd] text-white shadow-[0_2px_8px_rgba(174,186,205,0.4)]"
        : i === 2
          ? "bg-[#d2925c] text-white shadow-[0_2px_8px_rgba(210,146,92,0.4)]"
          : "bg-secondary text-muted-foreground";
  return (
    <span
      className={`font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${styles}`}
      aria-label={`Rank ${i + 1}`}
    >
      {i + 1}
    </span>
  );
}

function BoardRow({
  i,
  left,
  chip,
  chipClass,
}: {
  i: number;
  left: React.ReactNode;
  chip: string;
  chipClass: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <RankChip i={i} />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">{left}</div>
      <span
        className={`font-soft shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold leading-none ${chipClass}`}
      >
        {chip}
      </span>
    </div>
  );
}

function Board<T>({
  icon,
  title,
  note,
  loading,
  rows,
  emptyText,
  renderRow,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  loading: boolean;
  rows: T[];
  emptyText: string;
  renderRow: (row: T, i: number) => React.ReactNode;
}) {
  return (
    <section className="candy-card p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-extrabold text-foreground">{title}</h2>
          <p className="font-soft truncate text-xs font-semibold text-muted-foreground">{note}</p>
        </div>
      </div>
      {loading ? (
        <div className="space-y-2.5 pt-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 bg-secondary" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="font-soft py-3 text-sm font-semibold text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="divide-y divide-border/60">
          {rows.map((row, i) => renderRow(row, i))}
        </div>
      )}
    </section>
  );
}
