-- Custom (user-created) categories are coming -- before any exist, fix a
-- pre-existing inconsistency: deleting a category currently behaves three
-- different ways depending on what references it (transactions and
-- shared_expenses block the delete; bills silently set the column to
-- null; category_budgets cascade-delete the cap). Bills' "silent null"
-- behavior is the odd one out and the most surprising -- a bill quietly
-- loses its category with no warning. Matching it to
-- transactions/shared_expenses (block instead) now, while zero bills
-- reference a category that would ever need deleting, is free; doing it
-- later after real data exists would not be.
alter table public.bills drop constraint bills_category_id_fkey;
alter table public.bills
  add constraint bills_category_id_fkey
  foreign key (category_id) references public.categories(id);
