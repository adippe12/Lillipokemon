-- Migration 0003: broadcast trigger-word changes so the site's
-- trigger chips (and chat matching) update live.
alter publication supabase_realtime add table public.mon_triggers;
