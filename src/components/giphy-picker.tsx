"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchGiphy, type GiphyGif, type GiphySearchError } from "@/lib/giphy";

const PAGE_SIZE = 12;

/**
 * GIPHY search grid used inside the artwork proposal form.
 * Shows trending GIFs on open, debounced search while typing, hover-to-play
 * thumbnails and "load more" paging. Attribution footer required by GIPHY.
 */
export function GiphyPicker({ onPick }: { onPick: (gif: GiphyGif) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<GiphySearchError | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(async (query: string, offset: number) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    if (offset === 0) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    const res = await searchGiphy(query, offset, PAGE_SIZE, ctrl.signal);
    if (ctrl.signal.aborted) return;
    if (res.error) {
      setError(res.error);
      if (offset === 0) setItems([]);
      setHasMore(false);
    } else {
      setError(null);
      setItems((prev) =>
        offset === 0
          ? res.items
          : [...prev, ...res.items.filter((n) => !prev.some((p) => p.id === n.id))]
      );
      setHasMore(res.items.length >= PAGE_SIZE);
    }
    setLoading(false);
    setLoadingMore(false);
  }, []);

  // Initial trending fetch + debounced search-as-you-type.
  useEffect(() => {
    const query = q.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => void fetchPage(query, 0),
      query ? 450 : 0
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, fetchPage]);

  // Cancel in-flight requests when the dialog / tab unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const errorMessage =
    error === "no-key"
      ? "GIPHY search isn't set up yet — check back soon!"
      : "Couldn't reach GIPHY right now.";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="rounded bg-black px-1.5 py-0.5 text-[9px] font-black leading-none tracking-[0.14em] text-white"
        >
          GIPHY
        </span>
        <span className="font-soft truncate text-[11px] font-bold text-muted-foreground">
          {q.trim() ? `Results for “${q.trim()}”` : "Trending now — search for the perfect GIF"}
        </span>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void fetchPage(q.trim(), 0);
            }
          }}
          placeholder="Search GIPHY for a matching GIF…"
          aria-label="Search GIPHY"
          className="rounded-full border-border bg-white pl-9 font-soft font-semibold"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-2" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary/80" />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-secondary/50 p-5 text-center">
          <p className="font-soft text-sm font-semibold text-muted-foreground">{errorMessage}</p>
          {error !== "no-key" && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="font-soft rounded-full font-bold"
              onClick={() => void fetchPage(q.trim(), 0)}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Try again
            </Button>
          )}
        </div>
      ) : items.length === 0 ? (
        <p className="font-soft rounded-2xl border border-border bg-secondary/50 p-5 text-center text-sm font-semibold text-muted-foreground">
          No GIFs found for that search — try another word.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {items.map((gif) => (
              <GiphyThumb key={gif.id} gif={gif} onPick={() => onPick(gif)} />
            ))}
          </div>
          <div className="flex items-center justify-center pt-1">
            {hasMore && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={loadingMore}
                onClick={() => void fetchPage(q.trim(), items.length)}
                className="font-soft rounded-full px-4 font-bold"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Loading…
                  </>
                ) : (
                  "Load more GIFs"
                )}
              </Button>
            )}
          </div>
        </>
      )}

      <p className="font-soft text-center text-[11px] font-semibold text-muted-foreground">
        GIF search results via{" "}
        <a
          href="https://giphy.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-primary hover:underline"
        >
          GIPHY
        </a>
      </p>
    </div>
  );
}

/** Static thumbnail that plays on hover/focus (tap = pick). */
function GiphyThumb({ gif, onPick }: { gif: GiphyGif; onPick: () => void }) {
  const [anim, setAnim] = useState(false);
  const label = gif.title ? `Use GIF: ${gif.title}` : "Use this GIF";
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => setAnim(true)}
      onMouseLeave={() => setAnim(false)}
      onFocus={() => setAnim(true)}
      onBlur={() => setAnim(false)}
      className="group relative overflow-hidden rounded-lg border border-border bg-secondary/60 transition hover:border-[#00ff66]/70 focus-visible:outline-2 focus-visible:outline-primary"
      aria-label={label}
    >
      <img
        src={anim ? gif.thumbAnim : gif.thumb}
        alt=""
        loading="lazy"
        className="block h-auto w-full"
      />
      <span
        aria-hidden
        className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-px text-[8px] font-black leading-none tracking-[0.1em] text-[#00ff66] opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        USE
      </span>
    </button>
  );
}
