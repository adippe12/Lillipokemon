-- ============================================================
-- 0007 — Admin: edit every species field
-- Adds update_mon(): rename (with trigger-word + storage sync),
-- rewrite description/credit, fix discoverer & spotted count,
-- swap or clear artwork. Gated by the admins email list, same
-- as review_proposal / clear_mon_field / delete_mon.
-- Idempotent: safe to run multiple times.
-- ============================================================

create or replace function public.update_mon(
  p_mon_id uuid,
  p_name text default null,              -- null = keep; else canonicalized + validated
  p_description text default null,       -- null = keep (use p_clear_description to empty)
  p_description_by text default null,    -- credit for the new description (default: team)
  p_clear_description boolean default false,
  p_discovered_by text default null,     -- null = keep
  p_spotted_count integer default null,  -- null = keep
  p_image_path text default null,        -- null = keep (use p_clear_image to empty)
  p_image_by text default null,          -- credit for new artwork (default: team)
  p_clear_image boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, storage as $$
declare
  v_old_name text;
  v_canon text;
begin
  if not exists (select 1 from admins a where a.email = coalesce(auth.email(), '')) then
    raise exception 'Not authorized';
  end if;

  select name into v_old_name from mons where id = p_mon_id for update;
  if not found then
    raise exception 'Species not found';
  end if;

  -- ---- name (= the chat trigger word) ------------------------------------
  if p_name is not null and lower(coalesce(trim(p_name), '')) <> v_old_name then
    v_canon := regexp_replace(lower(coalesce(trim(p_name), '')), '_+$', '');
    v_canon := regexp_replace(v_canon, '[^a-z0-9_]', '', 'g');

    if v_canon = '' or char_length(v_canon) > 30 then
      raise exception 'Invalid name';
    end if;
    if v_canon !~ '^[a-z0-9]' then
      raise exception 'Name must start with a letter or digit';
    end if;
    -- profanity guard ALWAYS applies (substring match, same as discovery)
    if exists (select 1 from banned_words b where position(b.word in v_canon) > 0) then
      raise exception 'Blocked by the safety filter';
    end if;
    if not exists (select 1 from mon_triggers t where t.word = v_canon) then
      -- open matching rules: must end in "mon" (>= 5 chars), minus reserved words
      if v_canon !~ 'mon$' or char_length(v_canon) < 5 then
        raise exception 'Name must end in "mon" (or already be a curated trigger word)';
      end if;
      if exists (select 1 from reserved_words r where r.word = v_canon) then
        raise exception 'That word is reserved';
      end if;
    end if;
    if exists (select 1 from mons m where m.name = v_canon and m.id <> p_mon_id) then
      raise exception 'A species named % already exists', v_canon;
    end if;

    -- THE rename itself
    update mons set name = v_canon where id = p_mon_id;

    -- keep storage folders in sync with the new word (best effort)
    begin
      update storage.objects
         set name = 'approved/' || v_canon || substr(name, char_length('approved/' || v_old_name) + 1)
       where bucket_id = 'mon-images' and name like 'approved/' || v_old_name || '/%';
      update storage.objects
         set name = 'pending/' || v_canon || substr(name, char_length('pending/' || v_old_name) + 1)
       where bucket_id = 'mon-images' and name like 'pending/' || v_old_name || '/%';
    exception when others then
      null; -- best effort: a stray file keeps its old folder, nothing breaks
    end;

    -- fix the approved-art pointer and any pending image proposals
    update mons
       set image_path = case
         when image_path like 'approved/' || v_old_name || '/%'
           then 'approved/' || v_canon || substr(image_path, char_length('approved/' || v_old_name) + 1)
         else image_path end
     where id = p_mon_id;

    update proposals
       set content = 'pending/' || v_canon || substr(content, char_length('pending/' || v_old_name) + 1)
     where kind = 'image' and status = 'pending'
       and content like 'pending/' || v_old_name || '/%';

    -- keep the curated trigger list pointing at this species' word, so the
    -- species stays reachable even if the new name would not match openly
    delete from mon_triggers where word = v_old_name;
    insert into mon_triggers (word) values (v_canon) on conflict (word) do nothing;

    v_old_name := v_canon;
  end if;

  -- ---- discoverer ----------------------------------------------------------
  if p_discovered_by is not null then
    update mons
       set discovered_by = left(coalesce(nullif(trim(p_discovered_by), ''), 'anonymous'), 40)
     where id = p_mon_id;
  end if;

  -- ---- spotted count ---------------------------------------------------------
  if p_spotted_count is not null then
    if p_spotted_count < 0 or p_spotted_count > 1000000 then
      raise exception 'Spotted count out of range (0-1000000)';
    end if;
    update mons set spotted_count = p_spotted_count where id = p_mon_id;
  end if;

  -- ---- description -----------------------------------------------------------
  if p_clear_description then
    update mons set description = null, description_by = null where id = p_mon_id;
  elsif p_description is not null then
    if char_length(coalesce(trim(p_description), '')) = 0 then
      raise exception 'Description is empty (use the clear flag instead)';
    end if;
    if char_length(p_description) > 500 then
      raise exception 'Description is too long (max 500)';
    end if;
    -- same profanity gate as community proposals (word-boundary match)
    if exists (select 1 from banned_words b where p_description ~* ('\m' || b.word || '\M')) then
      raise exception 'Blocked by the safety filter';
    end if;
    update mons
       set description = trim(p_description),
           description_by = coalesce(nullif(trim(coalesce(p_description_by, '')), ''), 'team')
     where id = p_mon_id;
  end if;

  -- ---- artwork ---------------------------------------------------------------
  if p_clear_image then
    update mons set image_path = null, image_by = null where id = p_mon_id;
  elsif p_image_path is not null then
    update mons
       set image_path = p_image_path,
           image_by = coalesce(nullif(trim(coalesce(p_image_by, '')), ''), 'team')
     where id = p_mon_id;
  end if;
end $$;

grant execute on function
  public.update_mon(uuid, text, text, text, boolean, text, integer, text, text, boolean)
  to authenticated;
