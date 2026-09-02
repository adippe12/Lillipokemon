"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, publicImageUrl, supabaseConfigured, MON_IMAGES_BUCKET } from "@/lib/supabase";
import { type Mon, type Proposal, displayName, pokedexNumber, formatDate } from "@/lib/mons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MonSprite } from "@/components/mon-sprite";
import {
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Loader2,
  LogOut,
  PenLine,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

type EnrichedProposal = Proposal & { mon?: Mon };

export default function AdminPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [session, setSession] = useState<unknown>(null);
  const [authState, setAuthState] = useState<"loading" | "out" | "in">(
    supabaseConfigured ? "loading" : "out"
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthState(data.session ? "in" : "out");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setAuthState(s ? "in" : "out");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setSigningIn(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    setSigningIn(false);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-secondary/40">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <h1 className="font-pixel text-xs text-foreground">
            LILLI<span className="text-primary">PEDEX</span>{" "}
            <span className="text-muted-foreground">/ team console</span>
          </h1>
          <div className="flex items-center gap-3">
            <a href="/" className="font-lcd flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Back to dex <ExternalLink className="h-3 w-3" />
            </a>
            {authState === "in" && (
              <Button variant="ghost" size="sm" className="font-lcd" onClick={() => supabase.auth.signOut()}>
                <LogOut className="mr-1 h-3.5 w-3.5" /> Sign out
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {authState === "loading" && (
          <div className="mx-auto max-w-sm space-y-3">
            <Skeleton className="h-8 w-2/3 bg-secondary" />
            <Skeleton className="h-10 bg-secondary" />
            <Skeleton className="h-10 bg-secondary" />
          </div>
        )}
        {authState === "out" && (
          <div className="mx-auto max-w-sm rounded-xl border border-border bg-card p-6">
            <h2 className="font-pixel mb-4 text-[11px] uppercase text-muted-foreground">Team sign-in</h2>
            <form onSubmit={signIn} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="font-lcd">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-secondary/70 font-lcd" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="font-lcd">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPass ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-secondary/70 pr-10 font-lcd"
                  />
                  <button type="button" aria-label={showPass ? "Hide password" : "Show password"} onClick={() => setShowPass((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground">
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {authError && <p className="font-lcd text-sm text-destructive">{authError}</p>}
              <Button type="submit" disabled={signingIn} className="font-pixel w-full text-[11px] uppercase hover:bg-pokedex-dark-red">
                {signingIn ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Sign in
              </Button>
            </form>
          </div>
        )}
        {authState === "in" && <Console />}
      </main>
    </div>
  );
}

function Console() {
  const [proposals, setProposals] = useState<EnrichedProposal[]>([]);
  const [mons, setMons] = useState<Mon[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Mon | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: props }, { data: monsData }] = await Promise.all([
      supabase.from("proposals").select("*").order("created_at", { ascending: false }),
      supabase.from("mons").select("*").order("pokedex_no", { ascending: true }),
    ]);
    const monMap = new Map<string, Mon>((monsData ?? []).map((m) => [m.id, m as Mon]));
    setMons((monsData ?? []) as Mon[]);
    setProposals(
      ((props ?? []) as Proposal[]).map((p) => ({ ...p, mon: monMap.get(p.mon_id) }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("admin-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "proposals" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "mons" }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const pendingDesc = useMemo(() => proposals.filter((p) => p.status === "pending" && p.kind === "description"), [proposals]);
  const pendingImg = useMemo(() => proposals.filter((p) => p.status === "pending" && p.kind === "image"), [proposals]);

  async function review(p: EnrichedProposal, approve: boolean) {
    setBusyId(p.id);
    setMsg(null);
    try {
      let finalPath: string | null = null;
      if (approve && p.kind === "image" && p.mon) {
        const newName = `approved/${p.mon.name}/${p.id}.${p.content.split(".").pop() ?? "png"}`;
        const { error: moveErr } = await supabase.storage.from(MON_IMAGES_BUCKET).move(p.content, newName);
        if (moveErr) throw new Error(`Move failed: ${moveErr.message}`);
        finalPath = newName;
      }
      const { error } = await supabase.rpc("review_proposal", {
        p_proposal_id: p.id,
        p_approve: approve,
        p_final_image_path: finalPath,
      });
      if (error) throw error;
      if (!approve && p.kind === "image") {
        await supabase.storage.from(MON_IMAGES_BUCKET).remove([p.content]).catch(() => {});
      }
      setMsg(approve ? "Approved and published." : "Rejected.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function clearField(mon: Mon, field: "description" | "image") {
    setBusyId(mon.id);
    const { error } = await supabase.rpc("clear_mon_field", { p_mon_id: mon.id, p_field: field });
    setMsg(error ? error.message : `${field} cleared.`);
    await load();
    setBusyId(null);
  }

  async function removeMon(mon: Mon) {
    setRemoving(true);
    setMsg(null);
    try {
      // delete known image folders first (console has storage manage rights)
      for (const prefix of [`pending/${mon.name}`, `approved/${mon.name}`]) {
        const { data: objs } = await supabase.storage.from(MON_IMAGES_BUCKET).list(prefix);
        const paths = (objs ?? []).map((o) => `${prefix}/${o.name}`);
        if (paths.length) {
          await supabase.storage.from(MON_IMAGES_BUCKET).remove(paths).catch(() => {});
        }
      }
      const { error } = await supabase.rpc("delete_mon", { p_mon_id: mon.id });
      if (error) throw error;
      setMsg(`${displayName(mon.name)} removed — entry, proposals, images and its trigger word are gone.`);
      setRemoveTarget(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-6">
      {msg && (
        <Alert className="border-pokedex-cyan/40 bg-pokedex-cyan/10">
          <AlertDescription className="font-lcd text-sm">{msg}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between">
        <h2 className="font-pixel text-xs uppercase text-muted-foreground">
          Research queue — {pendingDesc.length + pendingImg.length} pending
        </h2>
        <Button variant="ghost" size="sm" className="font-lcd" onClick={() => void load()}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <Tabs defaultValue="descriptions">
        <TabsList className="bg-secondary">
          <TabsTrigger value="descriptions" className="font-lcd gap-1.5">
            <PenLine className="h-4 w-4" /> Descriptions ({pendingDesc.length})
          </TabsTrigger>
          <TabsTrigger value="images" className="font-lcd gap-1.5">
            <ImageIcon className="h-4 w-4" /> Images ({pendingImg.length})
          </TabsTrigger>
          <TabsTrigger value="species" className="font-lcd gap-1.5">
            Species ({mons.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="descriptions" className="mt-4 space-y-3">
          {loading ? (
            <Skeleton className="h-24 bg-secondary" />
          ) : pendingDesc.length === 0 ? (
            <Empty text="No descriptions waiting for review." />
          ) : (
            pendingDesc.map((p) => (
              <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-lcd">{p.mon ? displayName(p.mon.name) : "unknown mon"}</Badge>
                    <span className="font-lcd text-xs text-muted-foreground">by @{p.submitted_by} · {formatDate(p.created_at)}</span>
                  </div>
                  <p className="text-sm text-foreground">&ldquo;{p.content}&rdquo;</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" className="font-lcd" onClick={() => void review(p, true)} disabled={busyId === p.id}>
                    {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Approve
                  </Button>
                  <Button size="sm" variant="destructive" className="font-lcd" onClick={() => void review(p, false)} disabled={busyId === p.id}>
                    <X className="mr-1 h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="images" className="mt-4 space-y-3">
          {loading ? (
            <Skeleton className="h-40 bg-secondary" />
          ) : pendingImg.length === 0 ? (
            <Empty text="No images waiting for review." />
          ) : (
            pendingImg.map((p) => (
              <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-lg bg-[#101a1f]">
                  { }
                  <img src={publicImageUrl(p.content)} alt="Proposed artwork" className="max-h-28 max-w-28 object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-lcd">{p.mon ? displayName(p.mon.name) : "unknown mon"}</Badge>
                    <span className="font-lcd text-xs text-muted-foreground">by @{p.submitted_by} · {formatDate(p.created_at)}</span>
                  </div>
                  <p className="font-lcd truncate text-xs text-muted-foreground">{p.content}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" className="font-lcd" onClick={() => void review(p, true)} disabled={busyId === p.id}>
                    {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4" />} Approve
                  </Button>
                  <Button size="sm" variant="destructive" className="font-lcd" onClick={() => void review(p, false)} disabled={busyId === p.id}>
                    <X className="mr-1 h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="species" className="mt-4 space-y-3">
          {mons.map((m) => (
            <div key={m.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
              <div className="floaty flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[#101a1f]">
                {m.image_path ? (
                   
                  <img src={publicImageUrl(m.image_path)} alt="" className="h-14 w-14 object-contain" />
                ) : (
                  <MonSprite name={m.name} seed={m.id.slice(0, 8)} size={56} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-lcd text-sm text-muted-foreground">{pokedexNumber(m.pokedex_no)}</span>
                  <span className="font-pixel text-[11px] uppercase">{displayName(m.name)}</span>
                  <Badge variant="secondary" className="font-lcd">{m.spotted_count} spotted</Badge>
                  <Badge variant="secondary" className="font-lcd">by @{m.discovered_by}</Badge>
                </div>
                {m.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">&ldquo;{m.description}&rdquo;</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" variant="outline" className="font-lcd" disabled={busyId === m.id || !m.description} onClick={() => void clearField(m, "description")}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear desc
                </Button>
                <Button size="sm" variant="outline" className="font-lcd" disabled={busyId === m.id || !m.image_path} onClick={() => void clearField(m, "image")}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear art
                </Button>
                <Button size="sm" variant="destructive" className="font-lcd" disabled={busyId === m.id} onClick={() => setRemoveTarget(m)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove species
                </Button>
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-pixel text-xs uppercase">
              Remove {removeTarget ? displayName(removeTarget.name) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-lcd text-sm leading-relaxed">
              This permanently deletes the dex entry, every proposal and image submitted for it,
              and retires its trigger word — chat can no longer re-discover it. The pokedex number
              is never reused. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-lcd" disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="font-lcd bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                if (removeTarget) void removeMon(removeTarget);
              }}
            >
              {removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-secondary/30 p-10 text-center">
      <p className="font-lcd text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
