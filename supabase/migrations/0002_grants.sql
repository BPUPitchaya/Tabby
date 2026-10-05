-- Grant baseline table access to the authenticated role.
-- (We disabled "automatically expose new tables" on purpose, so this is a
-- deliberate, explicit step instead of an implicit one. RLS policies from
-- 0001_init.sql still govern exactly which ROWS each user can see/change —
-- these grants only control which TABLES the authenticated role may touch
-- at all. No grants to `anon`: this app has no legitimate unauthenticated
-- access path, every table requires a logged-in user.)

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.categories,
  public.transactions,
  public.flats,
  public.flat_members,
  public.shared_expenses,
  public.shared_expense_splits,
  public.settlements
to authenticated;
