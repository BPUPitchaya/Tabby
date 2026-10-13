-- Free-text payment info (bank account + reference, however the user
-- wants to write it) shown in a reminder message -- NZ has no
-- Venmo/Cash App equivalent with a reliable public deep link, and the
-- actual local norm is a plain bank transfer with an account number and
-- reference, not an app. Nullable: most reminders still work fine without
-- it, this just saves the ower a follow-up "what's your account number?"
-- message when it's set.
alter table public.profiles add column payment_details text;
