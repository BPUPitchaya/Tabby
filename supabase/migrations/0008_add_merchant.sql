-- Lets a user note *where* they spent money (e.g. "Pak'nSave", "Starbucks"),
-- not just what and how much. Nullable, optional -- existing rows and the
-- manual-entry flow both still work fine without it.
alter table public.transactions add column merchant text;
