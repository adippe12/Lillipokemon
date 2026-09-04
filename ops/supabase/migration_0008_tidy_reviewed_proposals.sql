-- ============================================================
-- 0008 — Tidy DB: reviewed proposals are deleted, not kept
-- review_proposal() now DELETES the proposal row after applying
-- it (approve) or discarding it (reject), instead of leaving an
-- approved/rejected row behind forever. Nothing in the app ever
-- reads reviewed rows: the team console queue filters
-- status = 'pending' and the public site only inserts proposals
-- (credits live on mons.description_by / mons.image_by).
--
-- Also:
--   * one-time purge of legacy reviewed rows (11 approved rows
--     had accumulated since launch)
--   * drops the now-dead "proposals_read_approved" public policy
--
-- Idempotent: safe to run multiple times.
-- ============================================================

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

  -- tidy: the review decision is applied to the species, then the
  -- proposal row itself is removed — the DB keeps no reviewed rows.
  delete from proposals where id = p_proposal_id;
end $$;

grant execute on function public.review_proposal(uuid, boolean, text) to authenticated;

-- one-time cleanup: purge legacy reviewed rows
delete from public.proposals where status <> 'pending';

-- nothing can read reviewed rows any more (there are none), and the
-- public never needed to read proposals at all — drop the dead policy
drop policy if exists "proposals_read_approved" on public.proposals;
