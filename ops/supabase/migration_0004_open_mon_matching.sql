-- ============================================================
-- Migration 0004: OPEN mon matching
-- ANY chat word ending in "mon" becomes a species (not only mon_triggers).
-- Guards: reserved_words blocklist + banned_words profanity substrings.
-- mon_triggers stays as an admin-curated allowlist (any word shape).
-- Idempotent: safe to run multiple times.
-- ============================================================

-- 1) reserved words table (public read so browser + worker use the same list)
create table if not exists public.reserved_words (
  word     text primary key,
  added_at timestamptz not null default now()
);

insert into public.reserved_words (word) values
  ('pokemon'), ('pokmon'), ('demon'), ('lemon'), ('salmon'), ('common'),
  ('uncommon'), ('summon'), ('sermon'), ('cinnamon'), ('gammon')
on conflict (word) do nothing;

alter table public.reserved_words enable row level security;

drop policy if exists "reserved_words_public_read" on public.reserved_words;
create policy "reserved_words_public_read"
  on public.reserved_words for select
  to anon, authenticated
  using (true);

grant select on public.reserved_words to anon, authenticated;

-- 2) re-add sillymon (missing from mon_triggers, chip + explicit allowlist)
insert into public.mon_triggers (word) values ('sillymon')
on conflict (word) do nothing;

-- 3) new discover_mon: open matching with guards
create or replace function public.discover_mon(p_name text, p_by text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  canon text;
  spotted_by text;
begin
  canon := regexp_replace(lower(coalesce(trim(p_name), '')), '_+$', '');
  canon := regexp_replace(canon, '[^a-z0-9_]', '', 'g');
  if canon = '' or char_length(canon) > 30 then
    return;
  end if;
  if canon !~ '^[a-z0-9]' then
    return; -- must start with a letter or digit
  end if;

  -- profanity guard ALWAYS applies (substring match, e.g. "fuckmon")
  if exists (select 1 from banned_words b where position(b.word in canon) > 0) then
    return;
  end if;

  if not exists (select 1 from mon_triggers t where t.word = canon) then
    -- open matching: any word ending in "mon" (>= 2 chars before it),
    -- minus reserved plain words ("demon", "pokemon", "lemon", ...)
    if canon !~ 'mon$' or char_length(canon) < 5 then
      return;
    end if;
    if exists (select 1 from reserved_words r where r.word = canon) then
      return;
    end if;
  end if;

  spotted_by := left(coalesce(nullif(trim(p_by), ''), 'anonymous'), 40);

  insert into mons (name, discovered_by, spotted_count, last_spotted_by)
  values (canon, spotted_by, 1, spotted_by)
  on conflict (name) do update set
    spotted_count  = mons.spotted_count + 1,
    last_spotted_by = excluded.last_spotted_by,
    last_spotted_at = now()
  where mons.last_spotted_by is distinct from excluded.last_spotted_by
     or mons.last_spotted_at < now() - interval '90 seconds';
end
$$;
