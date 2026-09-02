-- Migration 0002: admin species removal (see schema.sql section 15)
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
