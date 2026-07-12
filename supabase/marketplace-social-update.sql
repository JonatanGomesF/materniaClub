-- Execute este SQL no Supabase para ativar curtidas de produtos no marketplace.

create table if not exists public.product_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

alter table public.product_likes enable row level security;

drop policy if exists "product likes public read" on public.product_likes;
drop policy if exists "product likes owner insert" on public.product_likes;
drop policy if exists "product likes owner delete" on public.product_likes;

create policy "product likes public read"
on public.product_likes
for select
using (true);

create policy "product likes owner insert"
on public.product_likes
for insert
with check (auth.uid() = user_id);

create policy "product likes owner delete"
on public.product_likes
for delete
using (auth.uid() = user_id or public.is_admin());

notify pgrst, 'reload schema';
