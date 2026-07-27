-- Execute este SQL no Supabase para ativar avaliacoes de lojas.
-- A regra principal e: somente uma mae que abriu conversa de compra
-- com uma loja pode avaliar aquela loja.

create extension if not exists "pgcrypto";

create table if not exists public.store_reviews (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  store_product_id uuid references public.store_products(id) on delete set null,
  store_id uuid not null references public.stores(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 600),
  status text not null default 'published' check (status in ('published', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id)
);

create index if not exists store_reviews_store_id_idx
on public.store_reviews (store_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists store_reviews_updated_at on public.store_reviews;
create trigger store_reviews_updated_at
before update on public.store_reviews
for each row execute function public.set_updated_at();

alter table public.store_reviews enable row level security;

drop policy if exists "store reviews public read" on public.store_reviews;
drop policy if exists "store reviews buyer insert" on public.store_reviews;
drop policy if exists "store reviews admin update" on public.store_reviews;
drop policy if exists "store reviews admin delete" on public.store_reviews;

create policy "store reviews public read"
on public.store_reviews
for select
using (status = 'published' or reviewer_id = auth.uid() or public.is_admin());

create policy "store reviews buyer insert"
on public.store_reviews
for insert
with check (
  auth.uid() = reviewer_id
  and status = 'published'
  and exists (
    select 1
    from public.conversations c
    join public.store_products sp on sp.id = c.store_product_id
    join public.stores s on s.id = sp.store_id
    join public.profiles buyer on buyer.id = c.buyer_id
    join public.profiles seller on seller.id = c.seller_id
    where c.id = conversation_id
    and c.product_id is null
    and c.store_product_id is not null
    and c.store_product_id = store_reviews.store_product_id
    and sp.store_id = store_reviews.store_id
    and c.buyer_id = auth.uid()
    and c.seller_id = s.owner_id
    and buyer.account_type = 'user'
    and seller.account_type = 'store'
    and buyer.status = 'active'
    and seller.status = 'active'
    and s.status = 'verified'
    and exists (
      select 1 from public.messages m
      where m.conversation_id = c.id
    )
  )
);

create policy "store reviews admin update"
on public.store_reviews
for update
using (public.is_admin())
with check (public.is_admin());

create policy "store reviews admin delete"
on public.store_reviews
for delete
using (public.is_admin());

notify pgrst, 'reload schema';
