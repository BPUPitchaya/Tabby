-- "Send Reminder" currently only opens the native share sheet -- it never
-- shows up anywhere inside the app for the person being reminded. This
-- lets the creator's reminder actually surface in the ower's own bell/
-- Money Owing next time they open Tabby, not just as an outgoing text
-- message. Harmless to set on a guest share too (no account to read it
-- back from), so no guest/user branching needed in the app code.
alter table public.bill_split_shares add column reminded_at timestamptz;
