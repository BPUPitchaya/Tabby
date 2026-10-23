-- These two revokes already exist live on this project, applied manually
-- outside any committed migration at some point -- found via a get_advisors
-- diff while standing up a second (production) Supabase project from this
-- migrations folder alone, which came out more permissive than this one.
-- Written here, idempotently, so the migrations folder is an accurate
-- record of this project's actual state and any future environment built
-- from it matches without needing a manual diff again.
revoke execute on function public.find_flat_by_invite_code(text) from anon;
revoke execute on function public.find_user_id_by_email(text) from anon;
