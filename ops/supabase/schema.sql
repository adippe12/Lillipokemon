-- ============================================================
-- LILLIPEDEX — database schema, security policies & storage
-- Idempotent: safe to run multiple times.
-- ============================================================

-- 1) Admin emails (gate for all review actions) --------------
create table if not exists public.admins (
  email text primary key,
  added_at timestamptz not null default now()
);

-- 2) Trigger words (chat word -> species) --------------------
create table if not exists public.mon_triggers (
  word text primary key,
  added_at timestamptz not null default now()
);
insert into public.mon_triggers (word)
values ('sillymon'), ('eepymon'), ('sleepymon'), ('leafymon'), ('aquamon')
on conflict (word) do nothing;

-- 3) Species --------------------------------------------------
create table if not exists public.mons (
  id uuid primary key default gen_random_uuid(),
  pokedex_no int generated always as identity unique,
  name text unique not null,
  discovered_by text not null default 'anonymous',
  discovered_at timestamptz not null default now(),
  last_spotted_by text,
  last_spotted_at timestamptz not null default now(),
  spotted_count int not null default 1,
  description text,
  description_by text,
  image_path text,
  image_by text,
  created_at timestamptz not null default now(),
  constraint mons_name_len check (char_length(name) between 2 and 30)
);

-- 4) Research proposals --------------------------------------
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  mon_id uuid not null references public.mons(id) on delete cascade,
  kind text not null check (kind in ('description','image')),
  content text not null check (char_length(content) between 1 and 600),
  submitted_by text not null default 'anonymous',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
create index if not exists proposals_status_idx on public.proposals (status, created_at);
create index if not exists proposals_mon_idx on public.proposals (mon_id);

-- 5) Banned words (server-side safety filter) ----------------
create table if not exists public.banned_words (word text primary key);
insert into public.banned_words (word) values
  ('fuck'),('fucks'),('fucked'),('fucker'),('fuckers'),('fucking'),('motherfucker'),
  ('fuk'),('fukk'),('fck'),('phuck'),('shit'),('shits'),('shitty'),('bullshit'),
  ('bitch'),('bitches'),('b1tch'),('bastard'),('asshole'),('assholes'),('arsehole'),
  ('arse'),('cunt'),('cunts'),('dick'),('dickhead'),('dicks'),('cock'),('cocks'),
  ('cocksucker'),('pussy'),('tits'),('titties'),('boobs'),('slut'),('sluts'),
  ('whore'),('whores'),('skank'),('douchebag'),('douche'),
  ('fag'),('fags'),('faggot'),('faggots'),('f4ggot'),('nigga'),('nigger'),('niggers'),
  ('n1gger'),('n1gga'),('nigg'),('chink'),('spic'),('wetback'),('kike'),('tranny'),
  ('retard'),('retards'),('retarded'),('mongoloid'),('spastic'),
  ('rape'),('raped'),('rapist'),('molest'),('molester'),('molested'),
  ('pedo'),('pedophile'),('paedophile'),('porn'),('porno'),('pornography'),('p0rn'),
  ('hentai'),('cumshot'),('blowjob'),('handjob'),('jizz'),('orgasm'),
  ('nudes'),('sexting'),('dild'),('vibrator'),
  ('hitler'),('nazi'),('nazis'),('swastika'),('heil'),
  ('kys'),('suicid'),('groom'),('grooming'),('predator'),
  ('penis'),('vagina'),('anal'),('scrotum'),('testicle')
on conflict (word) do nothing;

-- 6) Safety trigger on proposals ------------------------------
create or replace function public.proposal_safety_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare w text;
begin
  if new.kind = 'description' then
    if char_length(new.content) > 500 then
      raise exception 'Description is too long';
    end if;
    for w in select word from banned_words loop
      if new.content ~* ('\m' || w || '\M') then
        raise exception 'Blocked by the safety filter';
      end if;
    end loop;
  else
    -- image proposals must point at the pending/ folder
    if new.content !~ '^pending/' then
      raise exception 'Image proposals must reference a pending upload';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists proposals_safety on public.proposals;
create trigger proposals_safety before insert or update on public.proposals
for each row execute function public.proposal_safety_check();

-- 7) Discovery RPC (chat -> species upsert) -------------------
-- OPEN matching: any word ending in "mon" (>= 2 chars before it) becomes a
-- species, minus reserved plain words + banned profanity substrings.
-- mon_triggers stays as an admin-curated allowlist (any word shape).
create table if not exists public.reserved_words (
  word     text primary key,
  added_at timestamptz not null default now()
);
insert into public.reserved_words (word) values
  ('pokemon'), ('pokmon'), ('demon'), ('lemon'), ('salmon'), ('common'),
  ('uncommon'), ('summon'), ('sermon'), ('cinnamon'), ('gammon')
on conflict (word) do nothing;

create or replace function public.discover_mon(p_name text, p_by text)
returns void
language plpgsql security definer set search_path = public as $$
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
    -- open matching: any *mon word, minus reserved plain words
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
end $$;

grant execute on function public.discover_mon(text, text) to anon, authenticated;

-- 8) Review RPC (admin approves / rejects proposals) ----------
-- The decision is applied to the species, then the proposal row is
-- DELETED — the DB keeps no reviewed rows (tidy by construction).
create or replace function public.review_proposal(
  p_proposal_id uuid,
  p_approve boolean,
  p_final_image_path text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  rec proposals%rowtype;
begin
  if not exists (select 1 from admins a where a.email = coalesce(auth.email(), '')) then
    raise exception 'Not authorized';
  end if;

  select * into rec from proposals where id = p_proposal_id for update;
  if not found then
    return; -- already reviewed (row gone); nothing to do
  end if;

  if p_approve then
    if rec.kind = 'description' then
      update mons
         set description = rec.content, description_by = rec.submitted_by
       where id = rec.mon_id;
    else
      update mons
         set image_path = coalesce(nullif(p_final_image_path, ''), rec.content),
             image_by   = rec.submitted_by
       where id = rec.mon_id;
    end if;
  end if;

  delete from proposals where id = p_proposal_id;
end $$;

grant execute on function public.review_proposal(uuid, boolean, text) to authenticated;

-- 9) Admin field reset (remove approved content) --------------
create or replace function public.clear_mon_field(p_mon_id uuid, p_field text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from admins a where a.email = coalesce(auth.email(), '')) then
    raise exception 'Not authorized';
  end if;
  if p_field = 'description' then
    update mons set description = null, description_by = null where id = p_mon_id;
  elsif p_field = 'image' then
    update mons set image_path = null, image_by = null where id = p_mon_id;
  else
    raise exception 'Unknown field';
  end if;
end $$;

grant execute on function public.clear_mon_field(uuid, text) to authenticated;

-- 10) Public pending counts (aggregate only) ------------------
create or replace function public.pending_counts()
returns table (mon_id uuid, pending_count bigint)
language sql security definer set search_path = public as $$
  select p.mon_id, count(*) as pending_count
  from proposals p
  where p.status = 'pending'
  group by p.mon_id
$$;

grant execute on function public.pending_counts() to anon, authenticated;

-- 11) Row Level Security --------------------------------------
alter table public.mons        enable row level security;
alter table public.proposals   enable row level security;
alter table public.admins      enable row level security;
alter table public.mon_triggers enable row level security;
alter table public.banned_words enable row level security;
alter table public.reserved_words enable row level security;

drop policy if exists "mons_public_read" on public.mons;
create policy "mons_public_read" on public.mons for select using (true);

drop policy if exists "proposals_insert_public" on public.proposals;
create policy "proposals_insert_public" on public.proposals for insert
  with check (kind in ('description','image') and char_length(content) between 1 and 600);

-- reviewed proposals are deleted on review; the public never reads
-- proposals at all (no public select policy)
drop policy if exists "proposals_read_approved" on public.proposals;

drop policy if exists "proposals_admin_read" on public.proposals;
create policy "proposals_admin_read" on public.proposals for select
  using (exists (select 1 from public.admins a where a.email = auth.email()));

drop policy if exists "proposals_admin_update" on public.proposals;
create policy "proposals_admin_update" on public.proposals for update
  using (exists (select 1 from public.admins a where a.email = auth.email()))
  with check (true);

-- admins: users can only ever see their own row (needed for policy checks)
drop policy if exists "admins_read_own" on public.admins;
create policy "admins_read_own" on public.admins for select
  using (email = auth.email());

-- triggers: public read (browser listener needs the word list)
drop policy if exists "triggers_public_read" on public.mon_triggers;
create policy "triggers_public_read" on public.mon_triggers for select using (true);

-- reserved words: public read (browser + worker open matching need the blocklist)
drop policy if exists "reserved_words_public_read" on public.reserved_words;
create policy "reserved_words_public_read" on public.reserved_words for select using (true);

-- banned_words: intentionally NO public read (do not reveal the filter)

-- 12) Realtime broadcast --------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.mons;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.proposals;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.mon_triggers;
  exception when others then null;
  end;
end $$;

-- 13) Storage bucket + policies --------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mon-images', 'mon-images', true, 2097152,
  '{image/png,image/jpeg,image/webp,image/gif}'
)
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = '{image/png,image/jpeg,image/webp,image/gif}';

drop policy if exists "mon_images_public_read" on storage.objects;
create policy "mon_images_public_read" on storage.objects for select
  using (bucket_id = 'mon-images');

drop policy if exists "mon_images_anon_upload_pending" on storage.objects;
create policy "mon_images_anon_upload_pending" on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'mon-images' and (storage.foldername(name))[1] = 'pending');

drop policy if exists "mon_images_admin_manage" on storage.objects;
create policy "mon_images_admin_manage" on storage.objects for all
  to authenticated
  using (bucket_id = 'mon-images')
  with check (bucket_id = 'mon-images');

-- 14) Table grants (PostgREST) ---------------------------------
grant select on public.mons to anon, authenticated;
grant select, insert on public.proposals to anon, authenticated;
grant select on public.mon_triggers to anon, authenticated;
grant select on public.reserved_words to anon, authenticated;

-- 15) Admin: remove a species entirely --------------------------
-- Deletes the dex entry, its proposals (FK cascade), its storage
-- images (pending/ + approved/ folders keyed by species name) and
-- retires its trigger word so chat cannot re-discover it.
create or replace function public.delete_mon(p_mon_id uuid)
returns void
language plpgsql security definer set search_path = public, storage as $$
declare
  mon_name text;
begin
  if not exists (select 1 from admins a where a.email = coalesce(auth.email(), '')) then
    raise exception 'Not authorized';
  end if;

  select name into mon_name from mons where id = p_mon_id for update;
  if not found then
    raise exception 'Species not found';
  end if;

  begin
    delete from storage.objects
     where bucket_id = 'mon-images'
       and (name like 'pending/' || mon_name || '/%'
            or name like 'approved/' || mon_name || '/%');
  exception when others then
    null; -- best-effort: the console also deletes files client-side
  end;

  delete from mons where id = p_mon_id;
  delete from mon_triggers where word = mon_name;
end $$;

grant execute on function public.delete_mon(uuid) to authenticated;
