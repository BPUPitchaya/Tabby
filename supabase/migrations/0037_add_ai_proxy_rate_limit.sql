-- Per-user rate limit for the ai-proxy Edge Function. Without this, a bug
-- in the client's retry logic (or a user manually spamming the quick-add
-- scan) has no ceiling other than Supabase's own project-wide quota --
-- one runaway client could burn through the shared GEMINI_API_KEY budget
-- for everyone. See /prometheus's "no rate limit on ai-proxy" gap.
--
-- Only ever touched by ai-proxy's service-role client, so no client-facing
-- RLS policies are needed -- RLS is enabled anyway as a safety net.
create table ai_proxy_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  request_count int not null default 0
);

alter table ai_proxy_usage enable row level security;

-- Atomic check-and-increment: a single upsert means concurrent calls from
-- the same user serialize on the row lock instead of racing a separate
-- "read count, then write count" pair of statements. Fixed hourly window
-- that rolls over on first use after it expires, rather than a sliding one
-- -- simpler, and precise enough for abuse prevention (not billing).
create or replace function check_ai_proxy_rate_limit(
  p_user_id uuid,
  p_limit int default 40,
  p_window interval default interval '1 hour'
) returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count int;
begin
  insert into ai_proxy_usage (user_id, window_start, request_count)
  values (p_user_id, now(), 1)
  on conflict (user_id) do update
    set request_count = case
          when ai_proxy_usage.window_start < now() - p_window then 1
          else ai_proxy_usage.request_count + 1
        end,
        window_start = case
          when ai_proxy_usage.window_start < now() - p_window then now()
          else ai_proxy_usage.window_start
        end
  returning request_count into v_count;

  return v_count <= p_limit;
end;
$$;
