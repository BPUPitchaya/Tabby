-- 0040 enabled RLS on chores but never granted table-level access to
-- authenticated, so every query failed with "permission denied for table
-- chores" regardless of the RLS policies -- same class of bug as 0038's
-- missing service_role grant on ai_proxy_usage. RLS restricts what a role
-- can see/touch; it never substitutes for the baseline GRANT.
grant select, insert, update, delete on public.chores to authenticated;
