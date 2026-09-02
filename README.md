# LILLIPEDEX 🔴

A live, community-powered Pokedex for the Twitch channel **[lillimon_](https://twitch.tv/lillimon_)**.

Any time someone types a word that **ends in `mon`** in chat (`sillymon`, `sillymon_`, `blobmon`, `gutmon`, …), a new species entry is created on the Pokedex in real time — ordinary words like "demon" or "pokemon" are reserved-ignored, and profanity is filtered server-side. Viewers can then propose **descriptions** and **artwork** for each species — everything is **safety-filtered and human-approved** before it goes live.

**100% free-forever stack:** Cloudflare Pages (static hosting) + Cloudflare Worker/Durable Object (24/7 listener) + Supabase free tier (database, auth, storage, realtime) + anonymous Twitch IRC (no API keys).

## Live URLs

| Deployment | URL |
|---|---|
| Cloudflare Pages (site) | https://lillipokemon.pages.dev/ |
| Cloudflare Workers (24/7 listener) | deployed via `scripts/deploy_listener.sh` |
| Team console | https://lillipokemon.pages.dev/admin/ |

---

## How it works

```
Twitch chat ──▶ LISTENERS (any of, idempotent together):
   (1) Cloudflare Durable Object  ops/listener/   — true 24/7, zero credentials
   (2) any open browser tab       src/lib/use-twitch-chat.ts — bonus eyes
                     │  same regex core:  ^|(non-word) trigger / *mon word _* (word-end)
                     ▼
             Supabase RPC discover_mon(name, spotted_by)   ← server validates trigger words,
                     │                                       dedups, rate-limits counters
                     ▼
             mons table ──▶ Supabase Realtime ──▶ every open Pokedex page updates live
                     │
viewers propose ────┤  (description text / image upload ≤2MB)
                     ▼
             proposals table (pending)  ← profanity filter (Postgres trigger) blocks bad text
                     │
channel admin ──▶ /admin console: approve or reject  ──▶ approved content published to entry
```

- **Two listeners, one core** (`ops/listener/src/irc-core.ts` + `src/lib/mons.ts`): the Durable Object listens 24/7; every open browser tab adds a bonus listener with live celebrations. Discovery is idempotent — 100 listeners = still 1 species, counter bumps are rate-limited (90s).
- **Open matching**: ANY chat word ending in `mon` (min 2 chars before it) discovers a species. Plain words that happen to end in `mon` ("demon", "pokemon", "lemon", …) live in the `reserved_words` table and are ignored; the `banned_words` profanity filter always applies. The five **featured trigger words** (chips in the hero) stay admin-curated in `mon_triggers` — they also allow custom word shapes. Listeners refresh both lists every few minutes.
- **Sprites**: species without approved art get a deterministic procedural pixel-mon generated from their name.

## Safety design

| Layer | Mechanism |
|---|---|
| Text | Server-side Postgres trigger + `banned_words` table (word-boundary regex, not reversible via API) |
| Text | Client-side pre-filter for instant feedback, 500-char hard cap, check constraints |
| Images | Only `image/png,jpeg,webp,gif`, ≤ 2MB (bucket-level), must land in `pending/` prefix (RLS) |
| Images | Stored in review queue; moved to `approved/` only on approval; never rendered publicly before that |
| Access | Row Level Security everywhere; anon can only read approved content + insert proposals |
| Admin | Supabase Auth account + `admins` allow-list table; open signups disabled; review via `security definer` RPCs |
| Keys | Only the public anon key ships to the browser; service key never leaves the server |

## Deploy (your own copy)

1. **Supabase**: create a project → run `ops/supabase/schema.sql` in the SQL editor.
2. Create an admin: Auth → add user, then `insert into admins (email) values ('your@email');`
3. **Hosting (Cloudflare Pages only)**:
     ```bash
     CF_EXPORT=1 NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... bun run build:static
     npx wrangler pages deploy .next-export --project-name lillipokemon
     ```
4. **Always-on listener** (`ops/listener/`): a Cloudflare Worker + Durable Object that keeps an anonymous IRC connection open 24/7 and reports spots to Supabase — no OBS browser source needed.
     ```bash
     scripts/deploy_listener.sh        # needs a CF token with Workers:Edit (+ Durable Objects)
     # then set NEXT_PUBLIC_LISTENER_URL=https://lillipokemon-listener.<subdomain>.workers.dev
     # and rebuild/redeploy the site to show the live "24/7 LISTENER" pill
     ```

## Dev

```bash
bun install
cp .env.example .env.local   # fill in your Supabase URL + anon key
bun run dev
bun run lint
```

## Resource links

- Twitch channel: https://twitch.tv/lillimon_
- Twitch chat IRC (anonymous) docs: https://dev.twitch.tv/docs/chat/irc/
- Supabase (DB / Auth / Storage / Realtime): https://supabase.com/docs
- Supabase Management API: https://supabase.com/docs/reference/api/introduction
- Cloudflare Pages: https://developers.cloudflare.com/pages/
- Next.js: https://nextjs.org/docs
- Tailwind CSS: https://tailwindcss.com/docs
- shadcn/ui: https://ui.shadcn.com
- Press Start 2P font: https://fonts.google.com/specimen/Press+Start+2P
- VT323 font: https://fonts.google.com/specimen/VT323
- canvas-confetti: https://github.com/catdad/canvas-confetti
