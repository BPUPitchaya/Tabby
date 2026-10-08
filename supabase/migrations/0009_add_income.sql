-- Second of the small/medium feature bundle (merchant -> income -> better
-- insights -> advice -> Tabby's mood). Without this, the app only ever
-- knew half the picture: "you spent $420" means nothing without knowing
-- what came in against it.

alter table public.transactions add column is_income boolean not null default false;

alter table public.categories add column type text not null default 'expense'
  check (type in ('expense', 'income'));

insert into public.categories (user_id, name, icon, type) values
  (null, 'Salary', 'briefcase', 'income'),
  (null, 'Gift', 'gift', 'income'),
  (null, 'Refund', 'rotate-ccw', 'income'),
  (null, 'Side Income', 'trending-up', 'income'),
  (null, 'Other Income', 'plus-circle', 'income');
