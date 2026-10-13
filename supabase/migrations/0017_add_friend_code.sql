-- A personal, shareable invite code for friend requests -- a second input
-- path into the same consent-gated sendFriendRequest flow as email-add,
-- not a parallel system (see session design notes). Still requires the
-- other person to accept; scanning/opening the link only resolves a code
-- to a user_id, same as the email lookup does today.
--
-- No new RPC needed: profiles already has an open "viewable by any
-- authenticated user" select policy (0001_init.sql), so a friend_code
-- lookup is just an ordinary select, the same openness level display_name
-- already has.
alter table public.profiles
  add column friend_code text unique not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
