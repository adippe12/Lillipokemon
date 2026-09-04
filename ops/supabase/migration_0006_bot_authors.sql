-- ============================================================
-- Migration 0006: chat bots are never spotters
--
-- StreamElements & co. post automated lines (alerts, loyalty
-- announcements) that can contain "mon" words; without a guard
-- the listener would credit those spots to the bot as author.
--
-- This is the LAST line of defense: the worker (listener.ts)
-- and the browser mirror (use-twitch-chat.ts) already skip bot
-- authors via isBotAuthor() BEFORE matching. The list mirrors
-- BOT_AUTHORS in src/lib/mons.ts.
-- Idempotent: safe to run multiple times.
-- ============================================================

create or replace function public.discover_mon(p_name text, p_by text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_canon  text;
  v_by     text;
  v_bumped int := 0;
  v_window interval := interval '30 seconds';
begin
  v_canon := regexp_replace(lower(coalesce(trim(p_name), '')), '_+$', '');
  v_canon := regexp_replace(v_canon, '[^a-z0-9_]', '', 'g');
  if v_canon = '' or char_length(v_canon) > 30 then
    return;
  end if;
  if v_canon !~ '^[a-z0-9]' then
    return; -- must start with a letter or digit
  end if;

  -- profanity guard ALWAYS applies (substring match, e.g. "fuckmon")
  if exists (select 1 from banned_words b where position(b.word in v_canon) > 0) then
    return;
  end if;

  if not exists (select 1 from mon_triggers t where t.word = v_canon) then
    -- open matching: any word ending in "mon" (>= 2 chars before it),
    -- minus reserved plain words ("demon", "pokemon", "lemon", ...)
    if v_canon !~ 'mon$' or char_length(v_canon) < 5 then
      return;
    end if;
    if exists (select 1 from reserved_words r where r.word = v_canon) then
      return;
    end if;
  end if;

  v_by := left(coalesce(nullif(trim(p_by), ''), 'anonymous'), 40);

  -- bot authors never discover or spot anything
  if lower(v_by) in ('streamelements', 'nightbot', 'moobot', 'streamlabs', 'fossabot') then
    return;
  end if;

  -- pair debounce: record the pair atomically - ROW_COUNT is 0 when
  -- the same author spotted the same mon within the window, which
  -- means this report is a duplicate and must not count
  insert into recent_spots as r (mon_name, spotted_by, spotted_at)
  values (v_canon, v_by, now())
  on conflict (mon_name, spotted_by) do update
    set spotted_at = now()
    where r.spotted_at < now() - v_window;

  get diagnostics v_bumped = row_count;
  if v_bumped = 0 then
    return;
  end if;

  -- opportunistic pruning: pairs older than 10 minutes are dead
  -- weight (the debounce only ever looks back v_window)
  delete from recent_spots where spotted_at < now() - interval '10 minutes';

  -- accepted: create the species or bump its counter
  insert into mons (name, discovered_by, spotted_count, last_spotted_by)
  values (v_canon, v_by, 1, v_by)
  on conflict (name) do update set
    spotted_count   = mons.spotted_count + 1,
    last_spotted_by = excluded.last_spotted_by,
    last_spotted_at = now();
end
$$;

comment on function public.discover_mon(text, text) is
  'Creates or spots a mon. Per (mon, author) 30s debounce; chat bot authors are ignored';
