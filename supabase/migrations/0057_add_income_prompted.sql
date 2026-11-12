-- Tracks whether the one-time "what's your income?" onboarding question
-- has been shown, same posture as payment_details_prompted
-- (0020_add_payment_details_prompted.sql): a user who skips still has no
-- income_sources row, and without this flag they'd be asked again on
-- every app open. Shown between the flat question and the payment
-- details question -- see FlatGate in app/(app)/_layout.tsx.
alter table public.profiles add column income_prompted boolean not null default false;
