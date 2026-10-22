-- Lets a user pick which animal mascot represents them -- shown on the
-- Profile header and the Home hero box (see tabby-mascot.tsx), instead of
-- everyone being stuck with the bear. Defaults to 'bear' so every existing
-- profile keeps today's look with no backfill needed.
alter table public.profiles add column avatar_animal text not null default 'bear'
  check (avatar_animal in ('bear','cat','dog','fox','rabbit','panda','koala','tiger','raccoon','hamster','otter'));
