-- null = hasn't answered the "living with flatmates?" onboarding question
-- yet (and has no flat) -- the Flat tab stays hidden only in that specific
-- state once a flat exists or they've explicitly said yes/no.
alter table public.profiles add column wants_flat boolean;
