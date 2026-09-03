/**
 * Unit tests for the chat-listener core (bun).
 * Run: bun ops/listener/test_core.ts
 */
import {
  parseIrcLine,
  findTrigger,
  SpotReporter,
  ircHandshake,
  fetchTriggers,
  fetchReserved,
} from "./src/irc-core";
import {
  buildTriggerRegex,
  canonicalize,
  findMonInText,
  isAllowedMonName,
  isBotAuthor,
  BOT_AUTHORS,
  DEFAULT_RESERVED,
} from "../../src/lib/mons";

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name}`, extra ?? "");
  }
}

// ---- canonicalize parity ----
check("canonicalize basic", canonicalize("SillyMon") === "sillymon");
check("canonicalize trailing underscore", canonicalize("SILLYMON___") === "sillymon");
check("canonicalize strips non-alnum", canonicalize("silly mon!!") === "sillymon");
check("canonicalize keeps underscore mid", canonicalize("silly_mon") === "silly_mon");

// ---- regex parity with browser ----
const re = buildTriggerRegex(["sillymon", "eepymon", "sleepymon"]);
check("regex built", re !== null);
check("matches plain", findTrigger("sillymon", re) === "sillymon");
check("matches shouty", findTrigger("YO SILLYMON!!!", re) === "sillymon");
check("matches trailing underscores", findTrigger("eepymon_ hi", re) === "eepymon");
check("matches inside sentence", findTrigger("gg sleepymon love it", re) === "sleepymon");
check("rejects prefix concat", findTrigger("supersillymon", re) === null);
check("rejects suffix concat", findTrigger("sillymonster", re) === null);
check("rejects underscore prefix concat", findTrigger("abcs_sillymon", re) === null);
check("matches after punctuation", findTrigger("(sleepymon)", re) === "sleepymon");
check("first match wins", findTrigger("eepymon then sillymon", re) === "eepymon");
check("null regex safe", findTrigger("sillymon", null) === null);

// ---- OPEN matching: findMonInText (trigger words first, then any *mon word) ----
const reserved = DEFAULT_RESERVED;
const re2 = buildTriggerRegex(["sillymon", "eepymon", "sleepymon"]);
check("open: any mon word", findMonInText("yo blobmon_ !!", re2, reserved) === "blobmon");
check("open: monmon", findMonInText("monmon", re2, reserved) === "monmon");
check("open: shouty", findMonInText("GUTMON FTW", re2, reserved) === "gutmon");
check("open: trigger still wins", findMonInText("blobmon then sillymon", re2, reserved) === "sillymon");
check("open: rejects reserved demon", findMonInText("the demon", re2, reserved) === null);
check("open: rejects reserved pokemon", findMonInText("pokemon go", re2, reserved) === null);
check("open: rejects reserved common", findMonInText("very common", re2, reserved) === null);
check("open: rejects short gmon", findMonInText("gmon", re2, reserved) === null);
check("open: rejects non-mon dragon", findMonInText("a dragon", re2, reserved) === null);
check("open: rejects profane", findMonInText("fuckmon", re2, reserved) === null);
check("open: rejects prefix concat", findMonInText("summon the blobmon", re2, reserved) === "blobmon", findMonInText("summon the blobmon", re2, reserved));
check("open: word after punctuation", findMonInText("(zedmon)", re2, reserved) === "zedmon");
check("open: rejects xyzmon_suffix", findMonInText("blobmonster", re2, reserved) === null);
check("open: pokmon (poké stripped)", findMonInText("pokémon", re2, reserved) === null);
check("isAllowedMonName unit", isAllowedMonName("zzzmon", reserved) === true && isAllowedMonName("demon", reserved) === false);

// ---- bot authors never count as spotters ----
check("bot: streamelements blocked (any case)", isBotAuthor("StreamElements") && isBotAuthor("streamelements"));
check("bot: all list entries blocked", BOT_AUTHORS.every((b) => isBotAuthor(b)));
check("bot: nightbot with odd casing blocked", isBotAuthor("NightBot"));
check("bot: humans never blocked", !isBotAuthor("lillimon_") && !isBotAuthor("SomeViewer") && !isBotAuthor(""));

// ---- parseIrcLine ----
const line =
  "@badge-info=;badges=;color=#FF0000;display-name=TestUser;mod=0;room-id=1;" +
  "subscriber=0;tmi-sent-ts=1730000000000;turbo=0;user-id=42;user-type= " +
  ":testuser!testuser@testuser.tmi.twitch.tv PRIVMSG #lillimon_ :ciao sillymon_ !!";
const msg = parseIrcLine(line);
check("parse: user", msg?.user === "testuser", msg);
check("parse: display-name", msg?.displayName === "TestUser", msg);
check("parse: text", msg?.text === "ciao sillymon_ !!", msg);
check("parse: no-tag line", parseIrcLine(":x!x@x.tmi.twitch.tv PRIVMSG #lillimon_ :sleepymon")?.text === "sleepymon");
check("parse: non-privmsg null", parseIrcLine(":tmi.twitch.tv PING :123") === null);
const parsed = parseIrcLine(line);
check("parse + match end-to-end", parsed ? findTrigger(parsed.text, re) === "sillymon" : false);

// ---- SpotReporter (mocked fetch) ----
const calls: { url: string; body: unknown }[] = [];
const g: Record<string, unknown> = globalThis as Record<string, unknown>;
const origFetch = g.fetch as typeof fetch;
g.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  calls.push({
    url: String(input),
    body: init?.body ? JSON.parse(String(init.body)) : null,
  });
  return new Response(null, { status: 204 });
}) as typeof fetch;

const reporter = new SpotReporter({
  supabaseUrl: "https://wzptdnwcnshdxwzsjyzb.supabase.co/",
  anonKey: "test-key",
});
check("report ok", (await reporter.report("sillymon", "TestUser")) === true);
check("report dedupes within 10s", (await reporter.report("sillymon", "TestUser")) === false);
check("different species not deduped", (await reporter.report("eepymon", "OtherUser")) === true);
check("same species different author not deduped", (await reporter.report("sillymon", "SomeoneElse")) === true);
check("rpc url", calls[0]?.url === "https://wzptdnwcnshdxwzsjyzb.supabase.co/rest/v1/rpc/discover_mon", calls[0]?.url);
check("rpc body", JSON.stringify(calls[1]?.body) === JSON.stringify({ p_name: "eepymon", p_by: "OtherUser" }), calls[1]?.body);
const stats = reporter.getStats();
check("stats", stats.spotCalls === 3 && stats.deduped === 1 && stats.spotErrors === 0, stats);

// error path
g.fetch = (async () => new Response("{}", { status: 400 })) as typeof fetch;
check("report handles http error", (await reporter.report("sleepymon", "X")) === false);
check("error counted", reporter.getStats().spotErrors >= 1, reporter.getStats());
g.fetch = origFetch;

// ---- ircHandshake ----
const sent: string[] = [];
ircHandshake("LilliMon_", (s) => sent.push(s));
check("handshake CAP", sent[0] === "CAP REQ :twitch.tv/tags");
check("handshake JOIN lowercase", sent[3] === "JOIN #lillimon_", sent[3]);

// ---- fetchTriggers (live DB, public read — same call the browser makes) ----
const triggers = await fetchTriggers(
  "https://wzptdnwcnshdxwzsjyzb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6cHRkbndjbnNoZHh3enNqeXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxNTYxMzQsImV4cCI6MjA3NzczMjEzNH0.-TR5U-dfcRCzBjgmlRJuP_XO6eRwYPS151JAWKGR5y8"
);
check("fetchTriggers live DB", triggers.length >= 3 && triggers.includes("sillymon"), triggers);

const reservedLive = await fetchReserved(
  "https://wzptdnwcnshdxwzsjyzb.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6cHRkbndjbnNoZHh3enNqeXpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxNTYxMzQsImV4cCI6MjA3NzczMjEzNH0.-TR5U-dfcRCzBjgmlRJuP_XO6eRwYPS151JAWKGR5y8"
);
check("fetchReserved live DB", reservedLive.includes("demon") && reservedLive.includes("pokemon"), reservedLive);

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
