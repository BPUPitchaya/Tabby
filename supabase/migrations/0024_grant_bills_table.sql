-- RLS alone isn't sufficient -- Postgres also requires an explicit table
-- GRANT to the `authenticated` role, or every query 403s with "permission
-- denied for table bills" regardless of policy. Missed in 0023, caught via
-- role-impersonation testing (same technique used for payment_details and
-- the bill_splits RLS recursion fix).
grant select, insert, update, delete on public.bills to authenticated;
