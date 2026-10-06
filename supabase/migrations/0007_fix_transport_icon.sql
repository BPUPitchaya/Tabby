-- 'car' isn't a valid Feather icon name (the set we render category icons
-- with); 'truck' is, and fits Transport well.
update public.categories set icon = 'truck' where name = 'Transport' and icon = 'car';
