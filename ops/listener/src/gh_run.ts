/**
 * GitHub Actions stopgap chat listener (bun runtime).
 *
 * Listens to #lillimon_ Twitch chat for LISTEN_MS (default ~4 min) and reports
 * spotted species to Supabase, then exits. Triggered every 5 minutes by
 * .github/workflows/chat-listener.yml so the dex keeps working even when
 * nobody has the site open — until the Cloudflare Worker (true 24/7 listener
 * in ops/listener/) is deployed.
 *
 * Uses the SAME matching core as the browser + worker (irc-core.ts) and the
 * same public anon key (public by design; discover_mon validates server-side).
 */
import { TWITCH_CHANNEL, buildTriggerRegex } from "../../../src/lib/mons";
import {
  IRC_WS_URL,
  SpotReporter,
  fetchTriggers,
  findTrigger,
  ircHandshake,
  parseIrcLine,
} from "./irc-core";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const CHANNEL = TWITCH_CHANNEL.toLowerCase();
const LISTEN_MS = Number(process.env.LISTEN_MS || 250_000); // ~4.2 min

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("SUPABASE_URL / SUPABASE_ANON_KEY missing");
  process.exit(1);
}

const deadline = Date.now() + LISTEN_MS;
const reporter = new SpotReporter({
  supabaseUrl: SUPABASE_URL,
  anonKey: ANON_KEY,
  log: (...a) => console.log("[gh-listener]", ...a),
});

let ws: WebSocket | null = null;
let connected = false;
let scanned = 0;
let reconnects = 0;
let regex: RegExp | null = null;

async function refreshTriggers(): Promise<void> {
  const words = await fetchTriggers(SUPABASE_URL, ANON_KEY);
  if (words.length) regex = buildTriggerRegex(words);
  console.log(`[gh-listener] triggers: ${words.join(", ")}`);
}

function connect(): void {
  if (Date.now() >= deadline) return;
  try {
    ws = new WebSocket(IRC_WS_URL);
  } catch (err) {
    console.log("[gh-listener] ws ctor failed:", err);
    return;
  }
  ws.addEventListener("open", () => {
    ircHandshake(CHANNEL, (s) => ws?.send(s));
  });
  ws.addEventListener("message", (ev) => {
    const data = String((ev as { data?: unknown }).data ?? "");
    for (const line of data.split("\r\n").filter(Boolean)) {
      if (line.startsWith("PING")) {
        ws?.send(`PONG ${line.slice(5)}`);
        continue;
      }
      if (line.includes(" JOIN #") || line.includes(" 366 ")) {
        if (!connected) console.log(`[gh-listener] connected to #${CHANNEL}`);
        connected = true;
        continue;
      }
      if (!line.includes(" PRIVMSG ")) continue;
      const msg = parseIrcLine(line);
      if (!msg) continue;
      scanned++;
      const canon = findTrigger(msg.text, regex);
      if (canon) {
        console.log(`[gh-listener] MATCH ${canon} by @${msg.displayName || msg.user}`);
        void reporter.report(canon, msg.displayName || msg.user);
      }
    }
  });
  ws.addEventListener("close", (ev) => {
    const ce = ev as { code?: number; reason?: string };
    if (ws) {
      ws = null;
      connected = false;
      reconnects++;
      if (Date.now() < deadline) {
        console.log(
          `[gh-listener] socket closed (code=${ce.code ?? "?"} reason=${JSON.stringify(
            ce.reason ?? ""
          )}), reconnecting in 2s`
        );
        setTimeout(connect, 2000 + Math.random() * 1500);
      }
    }
  });
  ws.addEventListener("error", () => {
    try {
      ws?.close();
    } catch {
      /* noop */
    }
  });
}

function shutdown(): void {
  try {
    ws?.close();
  } catch {
    /* noop */
  }
  const s = reporter.getStats();
  console.log(
    `[gh-listener] done — scanned=${scanned} connected=${connected} ` +
      `reconnects=${reconnects} spotCalls=${s.spotCalls} errors=${s.spotErrors}`
  );
  // always exit 0: a missed window is not a "failure", next run is 5 min away
  process.exit(0);
}

setTimeout(shutdown, LISTEN_MS);
// keepalive ping in the middle of the window (Twitch closes silent links)
setTimeout(() => ws?.send("PING :tmi.twitch.tv"), Math.floor(LISTEN_MS / 2));

await refreshTriggers();
connect();
