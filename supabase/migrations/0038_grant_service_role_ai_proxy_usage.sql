-- 0037 enabled RLS on ai_proxy_usage but never granted table-level access to
-- service_role. RLS doesn't apply to service_role (it bypasses RLS), but
-- Postgres still requires an explicit GRANT before any role -- service_role
-- included -- can touch a table. Without this, check_ai_proxy_rate_limit
-- failed on every call with "permission denied for table ai_proxy_usage",
-- taking down every AI feature in the app.
GRANT SELECT, INSERT, UPDATE ON public.ai_proxy_usage TO service_role;
