"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, publicImageUrl, supabaseConfigured, MON_IMAGES_BUCKET } from "@/lib/supabase";
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
import { MonSprite } from "./mon-sprite";
import { MonTypeChip } from "./mon-type-chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Check,
  FlaskConical,
  ImageIcon,
  Link2,
  Loader2,
  PenLine,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
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
        <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto border-2 bg-popover p-6 sm:max-w-xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{displayName(mon.name)} entry</DialogTitle>
            <DialogDescription>
              Details and research proposals for {displayName(mon.name)}.
            </DialogDescription>
          </DialogHeader>
          <DetailBody mon={mon} pendingCount={pendingCount} maxSpotted={maxSpotted} onOpenChange={onOpenChange} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function DetailBody({ mon, pendingCount, maxSpotted }: { mon: Mon; pendingCount: number; maxSpotted: number; onOpenChange: (o: boolean) => void }) {
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

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-start gap-4">
        <div className="floaty relative flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-[#101a1f] shadow-[inset_0_0_24px_#000000cc]">
          <span
            className="pointer-events-none absolute inset-0 rounded-xl opacity-60"
            style={{ background: `radial-gradient(80px 60px at 50% 45%, ${typeColor(mon.name)}22, transparent)` }}
            aria-hidden
          />
          {mon.image_path ? (
            <img
              src={publicImageUrl(mon.image_path)}
              alt={`${mon.name} approved artwork`}
              className="relative h-24 w-24 rounded-lg object-contain"
            />
          ) : (
            <MonSprite name={mon.name} seed={mon.id.slice(0, 8)} size={100} className="relative" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-lcd text-lg text-muted-foreground">{pokedexNumber(mon.pokedex_no)}</span>
            <h2 className="font-pixel truncate text-base uppercase text-pokedex-yellow">
              {displayName(mon.name)}
            </h2>
            <MonTypeChip name={mon.name} />
          </div>
          <div className="flex flex-wrap gap-1.5 font-lcd text-[13px]">
            <Badge variant="secondary" className="border border-pokedex-cyan/30 bg-pokedex-cyan/10 text-pokedex-cyan">
              {formatNumber(mon.spotted_count)} spotted
            </Badge>
            <Badge variant="secondary" className="border-border">
              found by @{mon.discovered_by}
            </Badge>
            <Badge variant="secondary" className="border-border">
              {formatDate(mon.discovered_at)}
            </Badge>
            {pendingCount > 0 && (
              <Badge className="border border-pokedex-yellow/40 bg-pokedex-yellow/10 text-pokedex-yellow">
                <FlaskConical className="mr-1 h-3 w-3" /> {pendingCount} in review
              </Badge>
            )}
          </div>
          <p className="font-lcd text-sm text-muted-foreground">
            last seen: {mon.last_spotted_by ? `@${mon.last_spotted_by}` : "?"} · {relativeTime(mon.last_spotted_at)}
          </p>
        </div>
        <ShareButton mon={mon} />
      </div>

      {/* popularity vs top species */}
      {maxSpotted > 0 && <PopularityBar spotted={mon.spotted_count} maxSpotted={maxSpotted} />}

      {/* description */}
      <div className="rounded-lg border border-border bg-secondary/60 p-4">
        <h3 className="font-pixel mb-2 text-[11px] uppercase text-muted-foreground">Dex entry</h3>
        {mon.description ? (
          <blockquote className="space-y-1">
            <p className="text-sm leading-relaxed text-foreground">&ldquo;{mon.description}&rdquo;</p>
            <footer className="font-lcd text-xs text-pokedex-cyan">— @{mon.description_by}</footer>
          </blockquote>
        ) : (
          <p className="text-sm italic text-muted-foreground">
            No approved research yet. This creature&apos;s behaviour is undocumented — propose a description below!
          </p>
        )}
      </div>

      {/* proposal form */}
      <ProposalSection mon={mon} nickname={nickname} setNickname={setNickname} />
    </div>
  );
}

function ProposalSection({
  mon,
  nickname,
  setNickname,
}: {
  mon: Mon;
  nickname: string;
  setNickname: (v: string) => void;
}) {
  return (
    <Tabs defaultValue="description" className="w-full">
      <TabsList className="grid w-full grid-cols-2 bg-secondary">
        <TabsTrigger value="description" className="font-lcd gap-1.5 text-sm">
          <PenLine className="h-4 w-4" /> Describe it
        </TabsTrigger>
        <TabsTrigger value="image" className="font-lcd gap-1.5 text-sm">
          <ImageIcon className="h-4 w-4" /> Submit art
        </TabsTrigger>
      </TabsList>
      <TabsContent value="description" className="mt-4">
        <DescriptionForm mon={mon} nickname={nickname} setNickname={setNickname} />
      </TabsContent>
      <TabsContent value="image" className="mt-4">
        <ImageForm mon={mon} nickname={nickname} setNickname={setNickname} />
      </TabsContent>
    </Tabs>
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
      <label htmlFor="lp-nick" className="font-lcd text-sm text-muted-foreground">
        Your name (shown as credit after approval)
      </label>
      <Input
        id="lp-nick"
        value={nickname}
        maxLength={MAX_NICKNAME}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="e.g. chatgoblin"
        className="bg-secondary/70 font-lcd"
      />
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
          <AlertDescription className="font-lcd text-sm">
            Submitted! The channel team reviews every entry before it appears — thanks, researcher.
          </AlertDescription>
        </Alert>
        <Button variant="secondary" className="font-lcd" onClick={() => setState("idle")}>
          Propose another
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <NicknameField nickname={nickname} setNickname={setNickname} />
      <div className="space-y-1.5">
        <label htmlFor="lp-desc" className="font-lcd text-sm text-muted-foreground">
          What is {displayName(mon.name)}? (max {MAX_DESCRIPTION} chars)
        </label>
        <Textarea
          id="lp-desc"
          value={text}
          maxLength={MAX_DESCRIPTION}
          onChange={(e) => setText(e.target.value)}
          placeholder="A gremlin of pure chaos that only appears when someone drops a combo..."
          rows={4}
          className="resize-none bg-secondary/70"
        />
        <div className="flex items-center gap-3">
          <Progress value={(text.length / MAX_DESCRIPTION) * 100} className="h-1.5" />
          <span className="font-lcd shrink-0 text-xs text-muted-foreground">
            {text.length}/{MAX_DESCRIPTION}
          </span>
        </div>
        {!clean && (
          <p className="font-lcd text-xs text-destructive">
            That wording will be blocked by the safety filter — please rephrase kindly.
          </p>
        )}
      </div>
      {error && <p className="font-lcd text-sm text-destructive">{error}</p>}
      <Button
        onClick={submit}
        disabled={state === "sending" || tooShort || !clean}
        className="font-pixel w-full text-[11px] uppercase hover:bg-pokedex-dark-red"
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
    if (!supabaseConfigured || !file) return;
    setState("sending");
    try {
      setProgressMsg("Uploading…");
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
      const path = `pending/${mon.name}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(MON_IMAGES_BUCKET)
        .upload(path, file, { contentType: file.type, cacheControl: "3600" });
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
    } catch {
      setError("Network hiccup — try again.");
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
          <AlertDescription className="font-lcd text-sm">
            Artwork uploaded! It goes live after the channel team approves it.
          </AlertDescription>
        </Alert>
        <Button variant="secondary" className="font-lcd" onClick={() => setState("idle")}>
          Submit another
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <NicknameField nickname={nickname} setNickname={setNickname} />
      <div className="space-y-2">
        <label className="font-lcd text-sm text-muted-foreground">Artwork (PNG/JPEG/WebP/GIF, max {MAX_IMAGE_MB}MB)</label>
        {preview ? (
          <div className="relative flex items-center justify-center rounded-lg border border-border bg-[#101a1f] p-6">
            { }
            <img src={preview} alt="Selected artwork preview" className="max-h-48 rounded object-contain" />
            <button
              aria-label="Remove selected image"
              onClick={() => pick(null)}
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 hover:bg-black/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/40 p-8 transition hover:border-pokedex-cyan/50 hover:bg-secondary/70"
          >
            <UploadCloud className="h-8 w-8 text-pokedex-cyan" />
            <span className="font-lcd text-sm text-muted-foreground">Click to choose an image</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
      </div>
      {error && <p className="font-lcd text-sm text-destructive">{error}</p>}
      <Button
        onClick={submit}
        disabled={state === "sending" || !file}
        className="font-pixel w-full text-[11px] uppercase hover:bg-pokedex-dark-red"
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
      className="font-lcd shrink-0 gap-1.5 border border-border px-2.5"
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

/** Horizontal bar comparing this species' spot count to the most-spotted one. */
function PopularityBar({ spotted, maxSpotted }: { spotted: number; maxSpotted: number }) {
  const pct = Math.max(4, Math.round((spotted / maxSpotted) * 100));
  const isTop = spotted >= maxSpotted;
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between font-lcd text-xs">
        <span className="text-muted-foreground">DEX POPULARITY</span>
        <span className={isTop ? "text-pokedex-yellow" : "text-muted-foreground"}>
          {isTop ? "top species!" : `${formatNumber(maxSpotted)} top record`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/40">
        <div
          className="h-full rounded-full bg-gradient-to-r from-pokedex-cyan to-pokedex-yellow transition-[width] duration-700"
          style={{ width: `${pct}%` }}
          role="meter"
          aria-valuenow={spotted}
          aria-valuemin={0}
          aria-valuemax={maxSpotted}
          aria-label="Popularity compared to the most spotted species"
        />
      </div>
    </div>
  );
}

/** Same palette as MonTypeChip, for glow accents around the sprite. */
function typeColor(name: string): string {
  return monTypeOf(name).color;
}
