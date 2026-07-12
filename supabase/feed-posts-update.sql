alter table public.posts
add column if not exists price numeric(10,2) check (price is null or price >= 0);

notify pgrst, 'reload schema';
