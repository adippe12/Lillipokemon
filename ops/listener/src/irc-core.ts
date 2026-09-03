/**
 * LILLIPEDEX chat-listener CORE — runtime-agnostic.
 *
 * Used by:
 *   - ops/listener/src/listener.ts  (Cloudflare Worker + Durable Object, 24/7)
 *
 * The browser listener (src/lib/use-twitch-chat.ts) implements the SAME
 * matching rules so every runtime discovers the same species.
 *
 * Matching source of truth: src/lib/mons.ts (canonicalize + buildTriggerRegex).
 */
import { buildTriggerRegex, canonicalize } from "../../../src/lib/mons";

export type IrcChatMessage = {
  user: string;
  displayName: string;
  text: string;
};

/** Parse a Twitch IRC PRIVMSG line (tags optional). Returns null for other lines. */
export function parseIrcLine(line: string): IrcChatMessage | null {
  let tagsStr = "";
  let rest = line;
  if (line.startsWith("@")) {
    const spaceIdx = line.indexOf(" ");
    if (spaceIdx === -1) return null;
    tagsStr = line.slice(1, spaceIdx);
    rest = line.slice(spaceIdx + 1);
  }
  const privIdx = rest.indexOf(" PRIVMSG ");
  if (privIdx === -1) return null;
  const colonIdx = rest.indexOf(" :", privIdx);
  if (colonIdx === -1) return null;
  const text = rest.slice(colonIdx + 2);
  const prefix = rest.slice(rest.indexOf(":") + 1, privIdx); // nick!nick@nick.tmi.twitch.tv
  const user = prefix.split("!")[0] || "anonymous";

  let displayName = user;
  const dnTag = tagsStr.split(";").find((p) => p.startsWith("display-name="));
  if (dnTag) displayName = dnTag.slice("display-name=".length) || user;

  return { user, displayName, text };
}

/** Run the trigger regex over a chat message, return the canonical species name (or null). */
export function findTrigger(text: string, regex: RegExp | null): string | null {
  if (!regex || !text) return null;
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const canonical = canonicalize(m[2]);
    if (canonical) return canonical;
  }
  return null;
}

export type SpotReporterStats = {
  spotCalls: number;
  spotErrors: number;
  deduped: number;
};

/**
 * Reports spotted species to Supabase (discover_mon RPC, anon key — the RPC is
 * SECURITY DEFINER and validates every input server-side). This worker is the
 * SINGLE writer to the dex; browser tabs are read-only mirrors.
 *
 * Keeps a tiny in-memory 10s per (species, author) dedupe so a chat spamming
 * the same word doesn't spam the RPC — keyed by author too, so two different
 * people spotting the same species in quick succession BOTH reach the DB
 * (which applies its own 30s per-(mon, author) pair debounce).
 */
export class SpotReporter {
  private url: string;
  private anonKey: string;
  private lastSent = new Map<string, number>(); // key: "species:author"
  private stats: SpotReporterStats = { spotCalls: 0, spotErrors: 0, deduped: 0 };
  private log: (...args: unknown[]) => void;

  constructor(opts: {
    supabaseUrl: string;
    anonKey: string;
    log?: (...args: unknown[]) => void;
  }) {
    this.url = opts.supabaseUrl.replace(/\/+$/, "");
    this.anonKey = opts.anonKey;
    this.log = opts.log ?? (() => {});
  }

  getStats(): SpotReporterStats {
    return { ...this.stats };
  }

  /** Returns true if a discover_mon call was actually attempted and succeeded. */
  async report(canonical: string, by: string): Promise<boolean> {
    const now = Date.now();
    const key = `${canonical}:${by}`;
    const last = this.lastSent.get(key);
    if (last !== undefined && now - last < 10_000) {
      this.stats.deduped++;
      return false;
    }
    this.lastSent.set(key, now);
    // opportunistic pruning
    if (this.lastSent.size > 64) {
      for (const [k, t] of this.lastSent) if (now - t > 30_000) this.lastSent.delete(k);
    }

    try {
      const res = await fetch(`${this.url}/rest/v1/rpc/discover_mon`, {
        method: "POST",
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ p_name: canonical, p_by: by || "anonymous" }),
      });
      if (res.ok) {
        this.stats.spotCalls++;
        return true;
      }
      this.stats.spotErrors++;
      const body = await res.text();
      this.log(`discover_mon ${canonical} failed: HTTP ${res.status} ${body.slice(0, 200)}`);
      return false;
    } catch (err) {
      this.stats.spotErrors++;
      this.log(`discover_mon ${canonical} threw:`, err);
      return false;
    }
  }
}

export const IRC_WS_URL = "wss://irc-ws.chat.twitch.tv:443";

/** Login burst for an anonymous justinfan IRC session. */
export function ircHandshake(channel: string, send: (s: string) => void): void {
  send("CAP REQ :twitch.tv/tags");
  send("PASS SCHMOOPIIE");
  send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`);
  send(`JOIN #${channel.toLowerCase()}`);
}

/**
 * Fetch the active trigger words from the DB (public read, same as the browser).
 * Falls back to [] on error — the regex then simply matches nothing, and the
 * server-side discover_mon double-validates every word anyway.
 */
export async function fetchTriggers(
  supabaseUrl: string,
  anonKey: string
): Promise<string[]> {
  try {
    const res = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/mon_triggers?select=word`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { word: string }[];
    return rows.map((r) => r.word).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Fetch reserved words (plain words ending in "mon" that must NOT become
 * species — "demon", "pokemon", ...). Public read, same as the browser.
 */
export async function fetchReserved(
  supabaseUrl: string,
  anonKey: string
): Promise<string[]> {
  try {
    const res = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/reserved_words?select=word`,
      {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      }
    );
    if (!res.ok) return [];
    const rows = (await res.json()) as { word: string }[];
    return rows.map((r) => r.word).filter(Boolean);
  } catch {
    return [];
  }
}

export { buildTriggerRegex, canonicalize } from "../../../src/lib/mons";
