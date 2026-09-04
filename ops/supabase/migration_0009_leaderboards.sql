-- ============================================================
-- 0009 — Leaderboards & stats
--
-- Two lifetime tallies, bumped ONLY when discover_mon() ACCEPTS a
-- spot (i.e. after validation, bot filtering and the per-pair
-- 30s debounce all pass — identical rules to the spotted counter):
--
--   spotters  : lifetime spot tally per chat nickname
--               (top spotters leaderboard)
--   spot_days : total accepted spots per UTC day (stats charts)
--
-- Both are public-read (leaderboard + stats pages subscribe via
-- realtime); no direct writes — everything flows through the
-- security definer RPC, which remains the single write path.
--
-- Historical per-spotter totals from before this migration are
-- unrecoverable (chat history is not stored), so the boards start
-- counting from deploy day; species/discoverer/contributor boards
-- are all-time because that data lives on mons.
-- Idempotent: safe to run multiple times.
-- ============================================================

-- 1) lifetime tally per spotter ------------------------------
create table if not exists public.spotters (
  name        text primary key,
  spots       bigint not null default 0,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

-- 2) accepted spots per UTC day -------------------------------
create table if not exists public.spot_days (
  day    date primary key,
  spots  bigint not null default 0
);

-- 3) RLS + grants: public read, no direct writes --------------
alter table public.spotters  enable row level security;
alter table public.spot_days enable row level security;

drop policy if exists "spotters_public_read" on public.spotters;
create policy "spotters_public_read" on public.spotters for select using (true);

drop policy if exists "spot_days_public_read" on public.spot_days;
create policy "spot_days_public_read" on public.spot_days for select using (true);

revoke all on public.spotters from anon, authenticated;
grant select on public.spotters to anon, authenticated;

revoke all on public.spot_days from anon, authenticated;
grant select on public.spot_days to anon, authenticated;

-- 4) realtime broadcast for live boards -----------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.spotters;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.spot_days;
  exception when others then null;
  end;
end $$;

-- 5) discover_mon: same rules + the two tallies ---------------
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

  -- lifetime tally per chat nickname (top spotters board)
  insert into spotters (name, spots, first_seen, last_seen)
  values (v_by, 1, now(), now())
  on conflict (name) do update set
    spots     = spotters.spots + 1,
    last_seen = now();

  -- per-day total for the stats charts
  insert into spot_days (day, spots)
  values (current_date, 1)
  on conflict (day) do update set
    spots = spot_days.spots + 1;
end
$$;

comment on function public.discover_mon(text, text) is
  'Creates or spots a mon. Per (mon, author) 30s debounce; chat bots ignored; bumps spotted counter, spotters tally and daily totals';

-- 6) one-time seed from the ephemeral recent_spots log --------
-- recent_spots is pruned to 10 minutes, so this is usually a
-- near-no-op; it only runs while the tallies are still empty.
insert into spotters (name, spots, first_seen, last_seen)
select spotted_by, count(*), min(spotted_at), max(spotted_at)
from public.recent_spots
where not exists (select 1 from public.spotters)
group by spotted_by
on conflict (name) do nothing;
