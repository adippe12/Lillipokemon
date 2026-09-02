-- ============================================================
-- Migration 0005: PAIR-based spot debounce (author + mon)
--
-- The browser tab is now READ-ONLY (the 24/7 worker is the only
-- writer) so the old 90s same-author row debounce on mons is
-- replaced by an explicit per-pair log:
--   key     (mon_name, spotted_by)
--   window  30 seconds
--   -> the SAME author re-spotting the SAME mon within the
--      window is a no-op
--   -> a DIFFERENT author always counts
--   -> the same author counts again once the window expired
-- Idempotent: safe to run multiple times.
-- ============================================================

-- 1) recent spot log: one row per (mon, author) pair
create table if not exists public.recent_spots (
  mon_name   text        not null,
  spotted_by text        not null,
  spotted_at timestamptz not null default now(),
  primary key (mon_name, spotted_by)
);

alter table public.recent_spots enable row level security;

-- only the security definer RPC touches this table (runs as owner,
-- bypasses RLS) - no direct anon or authenticated access at all
revoke all on public.recent_spots from anon, authenticated;

-- 2) new discover_mon: same validation, pair debounce instead of
--    the old author-only 90s row debounce
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

-- 3) sanity comment on the function
comment on function public.discover_mon(text, text) is
  'Creates or spots a mon. Debounce is per (mon, author) pair within 30 seconds';
