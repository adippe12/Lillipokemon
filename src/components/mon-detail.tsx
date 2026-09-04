"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase, publicImageUrl, supabaseConfigured, MON_IMAGES_BUCKET } from "@/lib/supabase";
import { GIPHY_ENABLED, fetchGifAsFile, type GiphyGif } from "@/lib/giphy";
import { GiphyPicker } from "./giphy-picker";
import {
  type Mon,
  type Proposal,
  MAX_DESCRIPTION,
  MAX_NICKNAME,
  MAX_IMAGE_MB,
  ALLOWED_IMAGE_TYPES,
  displayName,
  pokedexNumber,
  formatDate,
  formatNumber,
  relativeTime,
  monTypeOf,
  passesQuickFilter,
  canonicalize,
} from "@/lib/mons";
import { MonSprite, spriteBubbleBg } from "./mon-sprite";
import { MonTypeChip } from "./mon-type-chip";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowLeft,
  AtSign,
  BookOpen,
  Calendar,
  Check,
  ChevronRight,
  Crown,
  Flame,
  FlaskConical,
  Heart,
  ImageIcon,
  Link2,
  Loader2,
  PenLine,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
  ZoomIn,
} from "lucide-react";

type Props = {
  mon: Mon | null;
  pendingCount: number;
  maxSpotted: number;
  onOpenChange: (open: boolean) => void;
};

export function MonDetailDialog({ mon, pendingCount, maxSpotted, onOpenChange }: Props) {
  return (
    <Dialog open={!!mon} onOpenChange={onOpenChange}>
      {mon && (
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[min(88vh,640px)] w-full flex-col gap-0 overflow-hidden rounded-[1.75rem] border-2 border-border bg-popover p-0 shadow-[0_24px_60px_rgba(240,107,168,0.22)] sm:max-w-[560px]"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{displayName(mon.name)} entry</DialogTitle>
            <DialogDescription>
              Details and research proposals for {displayName(mon.name)}.
            </DialogDescription>
          </DialogHeader>
          <DetailBody key={mon.id} mon={mon} pendingCount={pendingCount} maxSpotted={maxSpotted} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function DetailBody({ mon, pendingCount, maxSpotted }: { mon: Mon; pendingCount: number; maxSpotted: number }) {
  // Full-size artwork viewer (lightbox) — object-cover crops the hero medallion,
  // so clicking it opens the uncropped original over a checkerboard.
  const [zoom, setZoom] = useState(false);
  // Single-flow layout: the body is one dex page. Contributing swaps the body
  // to a focused form view; the back chip always returns to the entry.
  const [view, setView] = useState<"entry" | "describe" | "art">("entry");
  const [showImprove, setShowImprove] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Dialog content mounts only after user interaction (post-hydration),
  // so a lazy initializer reading localStorage is hydration-safe.
  const [nickname, setNickname] = useState(() => {
    try {
      return window.localStorage.getItem("lp_nick") ?? "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    if (nickname.trim()) localStorage.setItem("lp_nick", nickname.trim().slice(0, MAX_NICKNAME));
  }, [nickname]);
  // Fresh views always start from the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [view]);

  return (
    <>
      {/* hero — fixed sheet header, tinted with the mon's type color */}
      <div className="relative shrink-0 overflow-hidden border-b border-border/70 bg-gradient-to-br from-white via-white to-secondary/70 px-5 pb-4 pt-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(260px 150px at 88% -12%, ${typeColor(mon.name)}2b, transparent)` }}
        />
        {/* floating action chips — share + close, app-style */}
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
          <ShareButton mon={mon} />
          <DialogClose
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-white/90 text-muted-foreground shadow-sm transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <X className="h-4 w-4" />
          </DialogClose>
        </div>

        <div className="relative flex items-start gap-4">
          <div
            className={`floaty relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border p-[3px] ${
              !mon.image_path ? "halo-dash halo-dash-spin" : ""
            }`}
            style={{
              background: spriteBubbleBg(mon.name, mon.id.slice(0, 8)),
              borderColor: "rgba(255,255,255,0.9)",
              boxShadow: "inset 0 -5px 12px rgba(240,107,168,0.10), 0 6px 16px rgba(240,107,168,0.12)",
            }}
          >
            {!mon.image_path && (
              <span
                className="pointer-events-none absolute inset-0 rounded-full opacity-60"
                style={{ background: `radial-gradient(80px 60px at 50% 45%, ${typeColor(mon.name)}18, transparent)` }}
                aria-hidden
              />
            )}
            {mon.image_path ? (
              <HeroArt path={mon.image_path} name={mon.name} onZoom={() => setZoom(true)} />
            ) : (
              <MonSprite name={mon.name} seed={mon.id.slice(0, 8)} size={70} className="relative" needsArt />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 pr-20 sm:pr-24">
              <span className="font-soft rounded-full bg-secondary px-2 py-0.5 text-[12px] font-bold text-muted-foreground">
                {pokedexNumber(mon.pokedex_no)}
              </span>
              <h2 className="font-display truncate text-lg font-extrabold text-foreground">
                {displayName(mon.name)}
              </h2>
              <MonTypeChip name={mon.name} />
            </div>
            <div className="flex flex-wrap gap-1.5 font-soft text-[11px] font-bold">
              <Badge variant="secondary" className="gap-1 rounded-full border border-primary/25 bg-primary/10 text-primary">
                <Heart className="h-3 w-3" aria-hidden /> {formatNumber(mon.spotted_count)} spotted
              </Badge>
              <Badge variant="secondary" className="gap-1 rounded-full border-border">
                <AtSign className="h-3 w-3" aria-hidden /> {mon.discovered_by}
              </Badge>
              <Badge variant="secondary" className="gap-1 rounded-full border-border">
                <Calendar className="h-3 w-3" aria-hidden /> {formatDate(mon.discovered_at)}
              </Badge>
              {pendingCount > 0 && (
                <Badge className="gap-1 rounded-full border border-pokedex-yellow/30 bg-pokedex-yellow/10 text-pokedex-yellow">
                  <FlaskConical className="h-3 w-3" /> {pendingCount} in review
                </Badge>
              )}
            </div>
            <p className="font-soft flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <span className="pulse-dot" aria-hidden />
              last seen: {mon.last_spotted_by ? `@${mon.last_spotted_by}` : "?"} · {relativeTime(mon.last_spotted_at)}
            </p>
          </div>
        </div>
      </div>

      {/* body — the only scrolling region inside the sheet */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div key={view} className="animate-in fade-in slide-in-from-bottom-2 space-y-4 p-5 pb-6 duration-200">
          {view === "entry" ? (
            <>
              {/* story */}
              <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-secondary/80 via-white to-white p-4">
                <span aria-hidden className="font-display pointer-events-none absolute -top-2 right-3 select-none text-6xl leading-none text-primary/10">
                  &ldquo;
                </span>
                <h3 className="font-soft mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  <BookOpen className="h-3.5 w-3.5 text-pokedex-cyan" aria-hidden /> Story
                </h3>
                {mon.description ? (
                  <blockquote className="space-y-1.5">
                    <p className="text-[15px] leading-relaxed text-foreground">&ldquo;{mon.description}&rdquo;</p>
                    <footer className="font-soft inline-flex items-center gap-1 rounded-full border border-border bg-white/80 px-2 py-0.5 text-[11px] font-bold text-pokedex-cyan">
                      <AtSign className="h-3 w-3" aria-hidden /> {mon.description_by}
                    </footer>
                  </blockquote>
                ) : (
                  <p className="text-sm leading-relaxed italic text-muted-foreground">
                    No approved research yet — this creature&apos;s behaviour is undocumented.
                  </p>
                )}
              </div>

              {/* popularity vs top species */}
              {maxSpotted > 0 && <PopularityBar spotted={mon.spotted_count} maxSpotted={maxSpotted} />}

              {/* contribute — the one call to action, at the natural end of the page */}
              <section aria-label="Contribute to this entry">
                <div className="flex items-center gap-3" aria-hidden>
                  <span className="h-px flex-1 bg-border/70" />
                  <h3 className="font-soft text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                    {mon.description && mon.image_path ? "Improve this entry" : "Help complete this entry"}
                  </h3>
                  <span className="h-px flex-1 bg-border/70" />
                </div>

                {mon.description && mon.image_path && !showImprove ? (
                  <div className="mt-3 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setShowImprove(true)}
                      className="font-soft inline-flex items-center gap-1.5 rounded-full border border-border bg-white/70 px-4 py-2 text-xs font-bold text-muted-foreground shadow-[0_2px_8px_rgba(240,107,168,0.06)] transition hover:border-primary/40 hover:text-primary"
                    >
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />
                      This entry is complete — improve it?
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {(!mon.description || showImprove) && (
                      <ContributeCard
                        icon={<PenLine className="h-5 w-5" />}
                        tone="primary"
                        title={mon.description ? "Propose a better story" : "Write the story"}
                        sub={
                          mon.description
                            ? "Share a sharper description with the channel team"
                            : "Tell chat what this mon is all about"
                        }
                        onClick={() => setView("describe")}
                      />
                    )}
                    {(!mon.image_path || showImprove) && (
                      <ContributeCard
                        icon={<ImageIcon className="h-5 w-5" />}
                        tone="cyan"
                        title={mon.image_path ? "Replace the artwork" : "Submit artwork"}
                        sub={
                          mon.image_path
                            ? "Upload a new official portrait"
                            : `Give ${displayName(mon.name)} its official portrait`
                        }
                        onClick={() => setView("art")}
                      />
                    )}
                  </div>
                )}
              </section>
            </>
          ) : (
            <>
              {/* focused form view — one thing on screen, back chip to return */}
              <button
                type="button"
                onClick={() => setView("entry")}
                className="font-soft inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:text-primary"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                back to entry
              </button>
              {view === "describe" ? (
                <DescriptionForm mon={mon} nickname={nickname} setNickname={setNickname} />
              ) : (
                <ImageForm mon={mon} nickname={nickname} setNickname={setNickname} />
              )}
            </>
          )}
        </div>
      </div>

      {/* full-size artwork lightbox — click the hero medallion to inspect the
          uncropped original (object-cover center-crops wide/tall art) */}
      {mon.image_path && (
        <Dialog open={zoom} onOpenChange={setZoom}>
          <DialogContent
            showCloseButton
            className="max-w-[min(92vw,860px)] rounded-3xl border-0 bg-transparent p-2 shadow-none focus:outline-none [&>button]:rounded-full [&>button]:border [&>button]:border-border [&>button]:bg-white/90 [&>button]:shadow-md"
            style={{ width: "min(92vw, 860px)" }}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{displayName(mon.name)} full artwork</DialogTitle>
              <DialogDescription>Uncropped view of the approved artwork.</DialogDescription>
            </DialogHeader>
            <img
              src={publicImageUrl(mon.image_path)}
              alt={`${mon.name} full artwork`}
              className="checker max-h-[78vh] w-full rounded-2xl object-contain"
            />
            <p className="font-soft text-center text-xs font-bold text-white/90 drop-shadow">
              {displayName(mon.name)} — official portrait
            </p>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Hero medallion artwork — click to open the full-size lightbox. */
function HeroArt({ path, name, onZoom }: { path: string; name: string; onZoom: () => void }) {
  return (
    <button
      type="button"
      onClick={onZoom}
      aria-label={`View full-size artwork of ${displayName(name)}`}
      title="View full size"
      className="group/art relative block h-full w-full cursor-zoom-in rounded-full focus-visible:outline-2"
    >
      <img
        src={publicImageUrl(path)}
        alt={`${name} approved artwork`}
        className="relative h-full w-full rounded-full object-cover"
      />
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center rounded-full bg-[#3a2b34]/0 opacity-0 transition group-hover/art:bg-[#3a2b34]/25 group-hover/art:opacity-100"
      >
        <span className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-foreground shadow-md">
          <ZoomIn className="h-3 w-3" /> full size
        </span>
      </span>
    </button>
  );
}

/** Big friendly choice card in the contribute section. */
function ContributeCard({
  icon,
  tone,
  title,
  sub,
  onClick,
}: {
  icon: ReactNode;
  tone: "primary" | "cyan";
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3.5 rounded-2xl border border-border bg-white/80 p-3.5 text-left shadow-[0_2px_10px_rgba(240,107,168,0.06)] transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_10px_24px_rgba(240,107,168,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition",
          tone === "primary" ? "bg-primary/10 text-primary" : "bg-pokedex-cyan/10 text-pokedex-cyan",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-soft block text-sm font-bold text-foreground">{title}</span>
        <span className="font-soft block text-xs font-semibold text-muted-foreground">{sub}</span>
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden
      />
    </button>
  );
}

function NicknameField({
  nickname,
  setNickname,
}: {
  nickname: string;
  setNickname: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="lp-nick" className="font-soft text-xs font-bold text-muted-foreground">
        Your name — shown as credit after approval
      </label>
      <div className="relative">
        <AtSign
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="lp-nick"
          value={nickname}
          maxLength={MAX_NICKNAME}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. chatgoblin"
          className="rounded-full bg-secondary/70 pl-8 font-soft font-semibold"
        />
      </div>
    </div>
  );
}

function DescriptionForm({
  mon,
  nickname,
  setNickname,
}: {
  mon: Mon;
  nickname: string;
  setNickname: (v: string) => void;
}) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const clean = passesQuickFilter(text);
  const tooShort = text.trim().length < 12;

  async function submit() {
    setError(null);
    if (!supabaseConfigured) {
      setError("Connection unavailable — try again soon.");
      return;
    }
    if (!clean) {
      setError("Your text didn't pass the safety filter — please rephrase.");
      return;
    }
    setState("sending");
    try {
      const { error: err } = await supabase.from("proposals").insert({
        mon_id: mon.id,
        kind: "description",
        content: text.trim().slice(0, 500),
        submitted_by: canonicalize(nickname) || "anonymous",
      });
      if (err) {
        const msg = /safety filter/i.test(err.message)
          ? "Blocked by the safety filter — please rephrase kindly."
          : err.message;
        setError(msg);
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setError("Network hiccup — try again.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div className="space-y-3">
        <Alert className="border-pokedex-cyan/40 bg-pokedex-cyan/10">
          <ShieldCheck className="h-4 w-4 text-pokedex-cyan" />
          <AlertDescription className="font-soft text-sm">
            Submitted! The channel team reviews every entry before it appears — thanks, researcher.
          </AlertDescription>
        </Alert>
        <Button variant="secondary" className="font-soft rounded-full font-bold" onClick={() => setState("idle")}>
          Propose another
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="lp-desc" className="font-soft text-sm font-bold text-muted-foreground">
          What is {displayName(mon.name)}? (max {MAX_DESCRIPTION} chars)
        </label>
        <Textarea
          id="lp-desc"
          value={text}
          maxLength={MAX_DESCRIPTION}
          onChange={(e) => setText(e.target.value)}
          placeholder="A gremlin of pure chaos that only appears when someone drops a combo..."
          rows={4}
          className="resize-none rounded-2xl bg-secondary/70 font-semibold"
        />
        <div className="flex items-center gap-3">
          <Progress value={(text.length / MAX_DESCRIPTION) * 100} className="h-1.5" />
          <span className="font-soft shrink-0 text-xs text-muted-foreground">
            {text.length}/{MAX_DESCRIPTION}
          </span>
        </div>
        {!clean && (
          <p className="font-soft text-xs text-destructive">
            That wording will be blocked by the safety filter — please rephrase kindly.
          </p>
        )}
      </div>

      <NicknameField nickname={nickname} setNickname={setNickname} />
      {error && <p className="font-soft text-sm text-destructive">{error}</p>}
      <Button
        onClick={submit}
        disabled={state === "sending" || tooShort || !clean}
        className="font-display w-full rounded-full text-sm font-bold shadow-[0_6px_18px_rgba(240,107,168,0.35)] hover:bg-pokedex-dark-red"
      >
        {state === "sending" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" /> Submit for review
          </>
        )}
      </Button>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-pokedex-cyan" />
        Safety: filtered for bad words + human-approved by the channel team before publishing.
      </p>
    </div>
  );
}

function ImageForm({
  mon,
  nickname,
  setNickname,
}: {
  mon: Mon;
  nickname: string;
  setNickname: (v: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Artwork source: a hand-picked file, or one found via the GIPHY picker.
  // The GIPHY option only renders when a free API key is configured.
  const [source, setSource] = useState<"upload" | "giphy">("upload");
  const [gifPick, setGifPick] = useState<GiphyGif | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(f: File | null) {
    setError(null);
    setFile(null);
    setPreview(null);
    if (!f) return;
    if (!ALLOWED_IMAGE_TYPES.includes(f.type)) {
      setError("Only PNG, JPEG, WebP or GIF allowed.");
      return;
    }
    if (f.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`Image too big — max ${MAX_IMAGE_MB}MB.`);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submit() {
    setError(null);
    if (!supabaseConfigured) return;
    if (source === "upload" && !file) return;
    if (source === "giphy" && !gifPick) return;
    setState("sending");
    try {
      let uploadFile: File;
      if (source === "giphy" && gifPick) {
        setProgressMsg("Fetching GIF from GIPHY…");
        // Download the GIF into our own storage bucket — the dex never hotlinks
        // GIPHY, so approval + hosting + rendering stay exactly the same.
        uploadFile = await fetchGifAsFile(gifPick, mon.name);
      } else if (file) {
        uploadFile = file;
      } else {
        setState("idle");
        return;
      }

      setProgressMsg("Uploading…");
      const ext =
        uploadFile.type === "image/png"
          ? "png"
          : uploadFile.type === "image/webp"
            ? "webp"
            : uploadFile.type === "image/gif"
              ? "gif"
              : "jpg";
      const path = `pending/${mon.name}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(MON_IMAGES_BUCKET)
        .upload(path, uploadFile, { contentType: uploadFile.type, cacheControl: "3600" });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        setState("idle");
        return;
      }

      setProgressMsg("Registering proposal…");
      const { error: dbErr } = await supabase.from("proposals").insert({
        mon_id: mon.id,
        kind: "image",
        content: path,
        submitted_by: canonicalize(nickname) || "anonymous",
      });
      if (dbErr) {
        await supabase.storage.from(MON_IMAGES_BUCKET).remove([path]);
        setError(
          /safety filter/i.test(dbErr.message)
            ? "Blocked by the safety filter."
            : `Could not register: ${dbErr.message}`
        );
        setState("idle");
        return;
      }
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network hiccup — try again.");
      setState("idle");
    } finally {
      setProgressMsg("");
    }
  }

  if (state === "done") {
    return (
      <div className="space-y-3">
        <Alert className="border-pokedex-cyan/40 bg-pokedex-cyan/10">
          <ShieldCheck className="h-4 w-4 text-pokedex-cyan" />
          <AlertDescription className="font-soft text-sm">
            Artwork uploaded! It goes live after the channel team approves it.
          </AlertDescription>
        </Alert>
        <Button variant="secondary" className="font-soft rounded-full font-bold" onClick={() => setState("idle")}>
          Submit another
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {GIPHY_ENABLED ? (
          <div className="flex items-center justify-between gap-2">
            <label className="font-soft text-sm font-bold text-muted-foreground">Artwork</label>
            <div className="flex rounded-full bg-secondary p-1" role="group" aria-label="Artwork source">
              <button
                type="button"
                onClick={() => {
                  setSource("upload");
                  setGifPick(null);
                }}
                aria-pressed={source === "upload"}
                className={`font-soft flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition ${
                  source === "upload"
                    ? "bg-white text-primary shadow-[0_2px_8px_rgba(240,107,168,0.15)]"
                    : "text-muted-foreground hover:text-primary"
                }`}
              >
                <UploadCloud className="h-3.5 w-3.5" /> Upload
              </button>
              <button
                type="button"
                onClick={() => {
                  setSource("giphy");
                  pick(null);
                }}
                aria-pressed={source === "giphy"}
                className={`font-soft flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition ${
                  source === "giphy"
                    ? "bg-white text-primary shadow-[0_2px_8px_rgba(240,107,168,0.15)]"
                    : "text-muted-foreground hover:text-primary"
                }`}
              >
                <Search className="h-3.5 w-3.5" /> GIPHY
              </button>
            </div>
          </div>
        ) : (
          <label className="font-soft text-sm font-bold text-muted-foreground">Artwork (PNG/JPEG/WebP/GIF, max {MAX_IMAGE_MB}MB)</label>
        )}
        {source === "upload" ? (
          <>
            {preview ? (
              <div className="relative flex items-center justify-center rounded-2xl border border-border bg-secondary/60 p-6">
                <img src={preview} alt="Selected artwork preview" className="max-h-48 rounded-lg object-contain" />
                <button
                  aria-label="Remove selected image"
                  onClick={() => pick(null)}
                  className="absolute right-2 top-2 rounded-full bg-foreground/20 p-1.5 text-foreground transition hover:bg-foreground/35"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-secondary/50 p-8 transition hover:border-primary/50 hover:bg-secondary"
              >
                <UploadCloud className="h-8 w-8 text-primary" />
                <span className="font-soft text-sm font-semibold text-muted-foreground">Click to choose an image</span>
              </button>
            )}
          </>
        ) : gifPick ? (
          <div className="relative flex items-center justify-center rounded-2xl border border-border bg-secondary/60 p-6">
            <img
              src={gifPick.thumbAnim}
              alt={gifPick.title ? `Selected GIF: ${gifPick.title}` : "Selected GIF"}
              className="max-h-48 rounded-lg object-contain"
            />
            <button
              aria-label="Remove selected GIF"
              onClick={() => setGifPick(null)}
              className="absolute right-2 top-2 rounded-full bg-foreground/20 p-1.5 text-foreground transition hover:bg-foreground/35"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <GiphyPicker onPick={(g) => setGifPick(g)} />
        )}
        {source === "giphy" && (
          <p className="font-soft text-[11px] leading-snug text-muted-foreground">
            The GIF is copied into the private review queue — the channel team still approves it before it goes live.
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
      </div>

      <NicknameField nickname={nickname} setNickname={setNickname} />
      {error && <p className="font-soft text-sm text-destructive">{error}</p>}
      <Button
        onClick={submit}
        disabled={state === "sending" || (source === "upload" ? !file : !gifPick)}
        className="font-display w-full rounded-full text-sm font-bold shadow-[0_6px_18px_rgba(240,107,168,0.35)] hover:bg-pokedex-dark-red"
      >
        {state === "sending" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {progressMsg || "Sending…"}
          </>
        ) : (
          <>
            <UploadCloud className="mr-2 h-4 w-4" /> Upload for review
          </>
        )}
      </Button>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-pokedex-cyan" />
        Safety: images sit in a private review queue and are never public until approved.
      </p>
    </div>
  );
}

/** Copy-to-clipboard share button producing a #mon-<name> deep link. */
function ShareButton({ mon }: { mon: Mon }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    const url = `${window.location.origin}/#mon-${mon.name}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard API can be unavailable (http / older browsers)
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* give up silently */
      }
      ta.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={copy}
      className="font-soft h-8 shrink-0 gap-1.5 rounded-full border border-border bg-white/90 px-3 font-bold shadow-sm"
      aria-label={`Copy share link for ${displayName(mon.name)}`}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5 text-pokedex-cyan" />
          <span className="hidden sm:inline text-pokedex-cyan">COPIED!</span>
        </>
      ) : (
        <>
          <Link2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Share</span>
        </>
      )}
    </Button>
  );
}

/** Slim one-row strip comparing this species' spots to the most-spotted one. */
function PopularityBar({ spotted, maxSpotted }: { spotted: number; maxSpotted: number }) {
  const pct = Math.max(4, Math.round((spotted / maxSpotted) * 100));
  const isTop = spotted >= maxSpotted;
  return (
    <div
      className="flex items-center gap-2.5 rounded-full border border-border bg-secondary/60 px-4 py-2"
      aria-label="Popularity compared to the most spotted species"
    >
      <Flame className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
      <span className="font-soft shrink-0 text-[11px] font-bold text-muted-foreground">
        {formatNumber(spotted)} {spotted === 1 ? "spot" : "spots"}
      </span>
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white shadow-[inset_0_1px_2px_rgba(240,107,168,0.2)]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-[#b9a7f2] transition-[width] duration-700"
          style={{ width: `${pct}%` }}
          role="meter"
          aria-valuenow={spotted}
          aria-valuemin={0}
          aria-valuemax={maxSpotted}
          aria-label="Popularity compared to the most spotted species"
        />
      </div>
      <span
        className={cn(
          "font-soft flex shrink-0 items-center gap-1 text-[11px] font-bold",
          isTop ? "text-pokedex-yellow" : "text-muted-foreground",
        )}
      >
        {isTop && <Crown className="h-3.5 w-3.5" aria-hidden />}
        {isTop ? "top species!" : `${Math.round((spotted / maxSpotted) * 100)}% of top`}
      </span>
    </div>
  );
}

/** Same palette as MonTypeChip, for glow accents around the sprite. */
function typeColor(name: string): string {
  return monTypeOf(name).color;
}
