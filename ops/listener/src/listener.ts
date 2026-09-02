/**
 * LILLIPEDEX always-on chat listener — Cloudflare Durable Object.
 *
 * ONE global instance ("singleton") holds an anonymous justinfan WebSocket to
 * Twitch IRC around the clock, matches trigger words, and reports spots to the
 * Supabase `discover_mon` RPC. No Twitch credentials required.
 *
 * Liveness model:
 *   - outbound WebSocket keeps the DO active while it flows;
 *   - a 2-minute ALARM watchdog wakes the DO even after eviction and
 *     reconnects if the socket died (this is what makes it "always on");
 *   - exponential backoff on reconnects, PING keepalive every 3.5 min.
 *
 * Endpoints (routed here by worker.ts):
 *   GET  /health  -> live status JSON (CORS: *)
 *   GET  /wake    -> same, but guarantees the DO booted
 *   POST /inject?token=<DEBUG_TOKEN>  { "text": "...", "user": "..." }
 *                 -> feeds a synthetic chat line through the real pipeline
 *                    (ops/testing only; gated by a secret token)
 */
import { TWITCH_CHANNEL, canonicalize, buildTriggerRegex } from "../../../src/lib/mons";
import {
  IRC_WS_URL,
  SpotReporter,
  fetchTriggers,
  findTrigger,
  ircHandshake,
  parseIrcLine,
} from "./irc-core";

const CHANNEL = TWITCH_CHANNEL.toLowerCase();
const KEEPALIVE_MS = 210_000; // PING Twitch every 3.5 min
const TRIGGERS_REFRESH_MS = 300_000; // refresh trigger words every 5 min
const WATCHDOG_MS = 120_000; // alarm-based self-check every 2 min
const MAX_BACKOFF_MS = 30_000;

type MinimalWs = {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: string, cb: (ev: { data?: unknown }) => void): void;
};

export class ChatListener {
  private state: {
    storage: { setAlarm(t: number): Promise<void> };
  };
  private env: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    DEBUG_TOKEN?: string;
  };

  private booted = false;
  private ws: MinimalWs | null = null;
  private connected = false;
  private connectedAt: number | null = null;
  private lastMessageAt: number | null = null;
  private msgsScanned = 0;
  private matchesFound = 0;
  private reconnects = 0;
  private attempts = 0;
  private triggers: string[] = [];
  private regex: RegExp | null = null;
  private reporter!: SpotReporter;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private triggersTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(state: { storage: { setAlarm(t: number): Promise<void> } }, env: ChatListener["env"]) {
    this.state = state;
    this.env = env;
    if (!this.booted) {
      this.booted = true;
      this.boot();
    }
  }

  private boot(): void {
    this.reporter = new SpotReporter({
      supabaseUrl: this.env.SUPABASE_URL,
      anonKey: this.env.SUPABASE_ANON_KEY,
      log: (...a) => console.log("[listener]", ...a),
    });
    void this.refreshTriggers();
    this.connect();
    this.keepaliveTimer = setInterval(() => {
      if (this.isOpen()) this.trySend("PING :tmi.twitch.tv");
    }, KEEPALIVE_MS);
    this.triggersTimer = setInterval(
      () => void this.refreshTriggers(),
      TRIGGERS_REFRESH_MS
    );
    // Alarm watchdog: fires even if the DO was evicted — the always-on guarantee.
    void this.state.storage.setAlarm(Date.now() + WATCHDOG_MS);
    console.log("[listener] booted for channel #" + CHANNEL);
  }

  // ---- HTTP ----

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname === "/wake") {
      return this.json(this.health());
    }
    if (url.pathname === "/inject") {
      if (!this.env.DEBUG_TOKEN || url.searchParams.get("token") !== this.env.DEBUG_TOKEN) {
        return this.json({ error: "forbidden" }, 403);
      }
      let body: { text?: string; user?: string; line?: string } = {};
      try {
        body = (await request.json()) as typeof body;
      } catch {
        return this.json({ error: "invalid json body" }, 400);
      }
      const line =
        body.line ||
        `:${body.user || "debug_user"}!${body.user || "debug_user"}@${
          body.user || "debug_user"
        }.tmi.twitch.tv PRIVMSG #${CHANNEL} :${body.text || ""}`;
      const result = this.handleLines(line);
      return this.json({ ok: true, ...result, stats: this.health() });
    }
    return this.json({
      service: "lillipokemon-listener",
      channel: CHANNEL,
      endpoints: ["/health", "/wake"],
    });
  }

  // ---- alarm watchdog ----

  async alarm(): Promise<void> {
    void this.state.storage.setAlarm(Date.now() + WATCHDOG_MS);
    if (!this.isOpen()) {
      this.connected = false;
      console.log("[listener] watchdog: socket not open, reconnecting");
      this.connect();
    } else {
      void this.refreshTriggers();
    }
  }

  // ---- IRC ----

  private connect(): void {
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    if (this.reconnectTimer) return; // a connection attempt is already scheduled

    let ws: WebSocket;
    try {
      ws = new WebSocket(IRC_WS_URL);
    } catch (err) {
      console.log("[listener] websocket ctor failed:", err);
      this.scheduleReconnect();
      return;
    }
    const wrapped = ws as unknown as MinimalWs;
    this.ws = wrapped;

    ws.addEventListener("open", () => {
      ircHandshake(CHANNEL, (s) => this.trySend(s));
      void this.refreshTriggers();
    });

    ws.addEventListener("message", (ev) => {
      this.handleLines(String((ev as { data?: unknown }).data ?? ""));
    });

    ws.addEventListener("close", () => {
      if (this.ws === wrapped) this.ws = null;
      this.connected = false;
      this.reconnects++;
      this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      try {
        ws.close();
      } catch {
        /* noop */
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.attempts++;
    const delay =
      Math.min(MAX_BACKOFF_MS, 1500 * Math.pow(1.6, Math.min(this.attempts, 8))) +
      Math.random() * 800;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
    // belt & braces: the alarm watchdog would also catch this
    void this.state.storage.setAlarm(Date.now() + WATCHDOG_MS);
  }

  private handleLines(data: string): { scanned: number; matched: string | null } {
    let scanned = 0;
    let matched: string | null = null;
    for (const line of data.split("\r\n").filter(Boolean)) {
      if (line.startsWith("PING")) {
        this.trySend(`PONG ${line.slice(5)}`);
        continue;
      }
      if (line.includes(" JOIN #") || line.includes(" 366 ")) {
        this.connected = true;
        this.connectedAt = Date.now();
        this.attempts = 0;
        continue;
      }
      if (!line.includes(" PRIVMSG ")) continue;
      const msg = parseIrcLine(line);
      if (!msg) continue;
      scanned++;
      this.msgsScanned++;
      this.lastMessageAt = Date.now();
      const canon = findTrigger(msg.text, this.regex);
      if (canon) {
        matched = canon;
        this.matchesFound++;
        const by = msg.displayName || msg.user;
        void this.reporter.report(canon, by).then((ok) => {
          if (!ok) console.log("[listener] spot not recorded:", canon, by);
        });
      }
    }
    return { scanned, matched };
  }

  private trySend(s: string): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return;
    try {
      ws.send(s);
    } catch {
      /* socket dying; close handler will reconnect */
    }
  }

  private isOpen(): boolean {
    return Boolean(this.ws && this.ws.readyState === 1);
  }

  // ---- triggers ----

  private async refreshTriggers(): Promise<void> {
    const words = await fetchTriggers(this.env.SUPABASE_URL, this.env.SUPABASE_ANON_KEY);
    if (words.length) this.triggers = words;
    this.regex = buildTriggerRegex(this.triggers);
  }

  // ---- health ----

  private health() {
    const now = Date.now();
    return {
      service: "lillipokemon-listener",
      channel: CHANNEL,
      connected: this.connected,
      socketOpen: this.isOpen(),
      connectedAt: this.connectedAt,
      uptimeSeconds: this.connectedAt ? Math.floor((now - this.connectedAt) / 1000) : 0,
      lastMessageAt: this.lastMessageAt,
      secondsSinceLastMessage: this.lastMessageAt
        ? Math.floor((now - this.lastMessageAt) / 1000)
        : null,
      msgsScanned: this.msgsScanned,
      matchesFound: this.matchesFound,
      reconnects: this.reconnects,
      triggers: this.triggers,
      reporter: this.reporter ? this.reporter.getStats() : null,
      checkedAt: new Date().toISOString(),
    };
  }

  private json(obj: unknown, status = 200): Response {
    return new Response(JSON.stringify(obj), {
      status,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "no-store",
      },
    });
  }
}

export { canonicalize };
