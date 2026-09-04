"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import {
  type Mon,
  type SpotDay,
  displayName,
  formatNumber,
  relativeTime,
} from "@/lib/mons";
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
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

const BAR_DAYS = 30;

export function StatsClient() {
  const [loading, setLoading] = useState(true);
  const [mons, setMons] = useState<Mon[]>([]);
  const [spotDays, setSpotDays] = useState<SpotDay[]>([]);
  const [spotterCount, setSpotterCount] = useState(0);

  const load = useCallback(async () => {
    const [{ data: ms }, { data: days }, { count }] = await Promise.all([
      supabase.from("mons").select("*"),
      supabase.from("spot_days").select("*").order("day", { ascending: true }),
      supabase.from("spotters").select("name", { count: "exact", head: true }),
    ]);
    setMons((ms ?? []) as Mon[]);
    setSpotDays((days ?? []) as SpotDay[]);
    setSpotterCount(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    // initial fetch: setState fires only after the awaited queries resolve
    // (same async-loader pattern as admin/page.tsx) — the rule can't see
    // through the useCallback boundary, hence the targeted disable
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const channel = supabase
      .channel("stats-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "mons" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "spot_days" }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const totalSpots = useMemo(
    () => mons.reduce((sum, m) => sum + m.spotted_count, 0),
    [mons]
  );

  const researchCredits = useMemo(
    () =>
      mons.reduce(
        (sum, m) =>
          sum +
          (m.description_by && m.description_by !== "team" ? 1 : 0) +
          (m.image_by && m.image_by !== "team" ? 1 : 0),
        0
      ),
    [mons]
  );

  const newest = useMemo(
    () =>
      [...mons].sort((a, b) => +new Date(b.discovered_at) - +new Date(a.discovered_at))[0],
    [mons]
  );

  const trackedSince = spotDays[0]?.day;

  const busiest = useMemo(() => {
    let best: SpotDay | null = null;
    for (const d of spotDays) if (!best || d.spots > best.spots) best = d;
    return best;
  }, [spotDays]);

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <Alert>
          <AlertDescription className="font-soft text-sm font-semibold">
            The dex is not connected to its database right now — stats are
            unavailable. Check back soon!
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
              href="/leaderboard/"
              aria-label="Leaderboards"
              title="Leaderboards"
              className="rounded-full border border-border bg-card p-2 text-muted-foreground shadow-[0_2px_8px_rgba(240,107,168,0.08)] transition hover:border-primary/40 hover:text-primary"
            >
              <Trophy className="h-4 w-4" />
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
          <span className="bubble bubble-sky bob" style={{ width: 52, height: 52, top: -14, right: 44 }} aria-hidden />
          <span className="bubble bubble-lavender bob" style={{ width: 36, height: 36, bottom: 16, left: -8, animationDelay: "1.5s" }} aria-hidden />
          <div className="relative z-10">
            <p className="font-soft flex items-center gap-1.5 text-sm font-bold text-primary">
              <BarChart3 className="h-4 w-4" aria-hidden />
              the whole dex, in numbers
            </p>
            <h2 className="font-display mt-2 text-2xl font-extrabold leading-snug text-foreground sm:text-3xl">
              Dex <span className="text-primary">stats</span>
            </h2>
            <p className="font-soft mt-3 text-base leading-relaxed font-semibold text-muted-foreground">
              How fast the encyclopedia grows, when chat is loudest, and every
              shout that made a species real — updated live.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* big number tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              icon={<Sparkles className="h-5 w-5 text-pokedex-yellow" />}
              value={loading ? null : mons.length}
              label="species discovered"
            />
            <StatTile
              icon={<Heart className="h-5 w-5 text-primary" />}
              value={loading ? null : totalSpots}
              label="total spots"
            />
            <StatTile
              icon={<Users className="h-5 w-5 text-pokedex-cyan" />}
              value={loading ? null : spotterCount}
              label="chatters on the boards"
            />
            <StatTile
              icon={<FlaskConical className="h-5 w-5 text-[#8a6fd1]" />}
              value={loading ? null : researchCredits}
              label="community research credits"
            />
          </div>

          {/* discovery curve */}
          <section className="candy-card p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Sparkles className="h-5 w-5 text-pokedex-yellow" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-extrabold text-foreground">
                  Species over time
                </h2>
                <p className="font-soft text-xs font-semibold text-muted-foreground">
                  every new species since the very first discovery
                </p>
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-40 bg-secondary" />
            ) : mons.length === 0 ? (
              <p className="font-soft py-3 text-sm font-semibold text-muted-foreground">
                No mons yet — the curve starts with the first discovery!
              </p>
            ) : (
              <DiscoveryCurve mons={mons} />
            )}
            {newest && (
              <p className="font-soft mt-3 text-sm font-semibold text-muted-foreground">
                Newest species:{" "}
                <span className="font-bold text-foreground">{displayName(newest.name)}</span>{" "}
                · {relativeTime(newest.discovered_at)}
              </p>
            )}
          </section>

          {/* spots per day */}
          <section className="candy-card p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                <Heart className="h-5 w-5 text-primary" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-lg font-extrabold text-foreground">
                  Spots per day
                </h2>
                <p className="font-soft text-xs font-semibold text-muted-foreground">
                  last {BAR_DAYS} days
                  {trackedSince
                    ? ` · daily counting started ${formatDayLabel(trackedSince)}`
                    : " · no spots counted yet"}
                </p>
              </div>
            </div>
            {loading ? (
              <Skeleton className="h-40 bg-secondary" />
            ) : (
              <SpotsPerDay days={spotDays} />
            )}
            {busiest && busiest.spots > 0 && (
              <p className="font-soft mt-3 text-sm font-semibold text-muted-foreground">
                Loudest day so far:{" "}
                <span className="font-bold text-foreground">
                  {formatDayLabel(busiest.day)} · {formatNumber(busiest.spots)} spots
                </span>
              </p>
            )}
          </section>

          {/* back to dex */}
          <div className="flex flex-col items-center gap-3 pt-2">
            <a
              href="/"
              className="font-soft flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-[0_6px_18px_rgba(240,107,168,0.35)] transition hover:bg-[#d5518d]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              back to the dex — add your own numbers!
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

// ---------- tiles ----------

function StatTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | null;
  label: string;
}) {
  return (
    <div className="candy-card flex flex-col items-center gap-1 p-4 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
        {icon}
      </span>
      <span className="font-display text-2xl font-extrabold leading-tight text-foreground">
        {value === null ? "…" : formatNumber(value)}
      </span>
      <span className="font-soft text-[11px] leading-tight font-semibold text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

// ---------- discovery curve (cumulative area, SVG) ----------

function DiscoveryCurve({ mons }: { mons: Mon[] }) {
  const buckets = useMemo(() => buildCumulative(mons), [mons]);
  const W = 600;
  const H = 170;
  const PL = 10;
  const PR = 10;
  const PT = 12;
  const PB = 22;
  const iw = W - PL - PR;
  const ih = H - PT - PB;
  const max = Math.max(1, buckets[buckets.length - 1]?.total ?? 1);
  const x = (i: number) => PL + (buckets.length <= 1 ? iw / 2 : (i / (buckets.length - 1)) * iw);
  const y = (v: number) => PT + ih - (v / max) * ih;

  const line = buckets.map((b, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(b.total).toFixed(1)}`).join(" ");
  const area = `${line} L${x(buckets.length - 1).toFixed(1)},${(PT + ih).toFixed(1)} L${x(0).toFixed(1)},${(PT + ih).toFixed(1)} Z`;
  const firstLabel = formatDayLabel(buckets[0].day);
  const lastLabel = formatDayLabel(buckets[buckets.length - 1].day);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Cumulative number of species discovered over time"
    >
      <defs>
        <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f06ba8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f06ba8" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line
        x1={PL}
        y1={PT + ih}
        x2={W - PR}
        y2={PT + ih}
        stroke="#e5e0dc"
        strokeWidth="1.5"
      />
      <path d={area} fill="url(#curve-fill)" />
      <path d={line} fill="none" stroke="#f06ba8" strokeWidth="2.5" strokeLinecap="round" />
      <circle
        cx={x(buckets.length - 1)}
        cy={y(buckets[buckets.length - 1].total)}
        r="4"
        fill="#f06ba8"
        stroke="#fff"
        strokeWidth="2"
      />
      <text x={PL} y={H - 6} fontSize="10" fontWeight="700" fill="#a89f99" fontFamily="inherit">
        {firstLabel}
      </text>
      <text x={W - PR} y={H - 6} fontSize="10" fontWeight="700" fill="#a89f99" textAnchor="end">
        {lastLabel}
      </text>
      <text x={W - PR} y={PT + 2} fontSize="10" fontWeight="800" fill="#f06ba8" textAnchor="end">
        {formatNumber(buckets[buckets.length - 1].total)} species
      </text>
    </svg>
  );
}

/** Build cumulative per-day buckets (max ~120 buckets; weeks if the range is long). */
function buildCumulative(mons: Mon[]) {
  if (mons.length === 0) return [];
  const DAY = 86_400_000;
  const startMs = Math.min(...mons.map((m) => dayStart(+new Date(m.discovered_at))));
  const endMs = dayStart(Date.now());
  const totalDays = Math.max(1, Math.round((endMs - startMs) / DAY));

  const perDay = new Array(totalDays + 1).fill(0) as number[];
  for (const m of mons) {
    const idx = Math.round((dayStart(+new Date(m.discovered_at)) - startMs) / DAY);
    if (idx >= 0 && idx <= totalDays) perDay[idx] += 1;
  }

  // long ranges: merge consecutive days into weekly-ish buckets
  const size = Math.max(1, Math.ceil((totalDays + 1) / 120));
  const out: { day: string; total: number }[] = [];
  let acc = 0;
  for (let i = 0; i < perDay.length; i += size) {
    let bucketNew = 0;
    for (let j = i; j < Math.min(i + size, perDay.length); j++) bucketNew += perDay[j];
    acc += bucketNew;
    out.push({ day: new Date(startMs + i * DAY).toISOString().slice(0, 10), total: acc });
  }
  return out;
}

function dayStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// ---------- spots per day (bar chart, zero-filled) ----------

function SpotsPerDay({ days }: { days: SpotDay[] }) {
  const bars = useMemo(() => {
    const map = new Map(days.map((d) => [d.day, d.spots]));
    const out: { day: string; spots: number }[] = [];
    const DAY = 86_400_000;
    const today = dayStart(Date.now());
    for (let i = BAR_DAYS - 1; i >= 0; i--) {
      const day = new Date(today - i * DAY).toISOString().slice(0, 10);
      out.push({ day, spots: map.get(day) ?? 0 });
    }
    return out;
  }, [days]);

  const W = 600;
  const H = 170;
  const PL = 10;
  const PR = 10;
  const PT = 14;
  const PB = 22;
  const iw = W - PL - PR;
  const ih = H - PT - PB;
  const max = Math.max(1, ...bars.map((b) => b.spots));
  const slot = iw / BAR_DAYS;
  const bw = Math.max(4, slot * 0.62);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label="Accepted spots per day over the last 30 days"
    >
      <line x1={PL} y1={PT + ih} x2={W - PR} y2={PT + ih} stroke="#e5e0dc" strokeWidth="1.5" />
      {bars.map((b, i) => {
        const h = b.spots > 0 ? Math.max(4, (b.spots / max) * ih) : 0;
        return (
          <g key={b.day}>
            <rect
              x={PL + i * slot + (slot - bw) / 2}
              y={PT + ih - h}
              width={bw}
              height={h}
              rx={Math.min(3, bw / 2)}
              fill="#f06ba8"
              opacity={b.spots > 0 ? 0.8 : 0.15}
            >
              <title>{`${formatDayLabel(b.day)} — ${b.spots} spot${b.spots === 1 ? "" : "s"}`}</title>
            </rect>
          </g>
        );
      })}
      <text x={PL} y={H - 6} fontSize="10" fontWeight="700" fill="#a89f99">
        {formatDayLabel(bars[0]?.day ?? "")}
      </text>
      <text x={W - PR} y={H - 6} fontSize="10" fontWeight="700" fill="#a89f99" textAnchor="end">
        today
      </text>
      {max > 1 && (
        <text x={W - PR} y={PT - 2} fontSize="10" fontWeight="800" fill="#f06ba8" textAnchor="end">
          peak {formatNumber(max)}/day
        </text>
      )}
    </svg>
  );
}

function formatDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(+d)) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
