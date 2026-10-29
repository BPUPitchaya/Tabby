-- Found while applying 0049: 0035's `create or replace function
-- confirm_share_paid_by_ower(p_share_id uuid, p_note text default null)`
-- has a different argument list than 0034's original
-- confirm_share_paid_by_ower(p_share_id uuid) -- Postgres treats those as
-- two separate overloaded functions, not a replacement, so the old 1-arg
-- version was silently orphaned rather than removed. It's harmless (RLS
-- now blocks the raw update it depends on either way), but it's dead code
-- and was showing up in the security linter. Drop it.
drop function if exists public.confirm_share_paid_by_ower(uuid);
