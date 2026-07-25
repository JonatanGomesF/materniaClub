-- Execute este SQL no Supabase para ativar avaliacoes entre maes.
-- A regra principal e: somente a compradora de uma conversa de marketplace
-- entre duas maes pode avaliar a vendedora daquela conversa.

create extension if not exists "pgcrypto";

create table if not exists public.mother_reviews (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewed_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 600),
  status text not null default 'published' check (status in ('published', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id),
  check (reviewer_id <> reviewed_id)
);

create index if not exists mother_reviews_reviewed_id_idx
on public.mother_reviews (reviewed_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists mother_reviews_updated_at on public.mother_reviews;
create trigger mother_reviews_updated_at
before update on public.mother_reviews
for each row execute function public.set_updated_at();

alter table public.mother_reviews enable row level security;

drop policy if exists "mother reviews public read" on public.mother_reviews;
drop policy if exists "mother reviews buyer insert" on public.mother_reviews;
drop policy if exists "mother reviews admin update" on public.mother_reviews;
drop policy if exists "mother reviews admin delete" on public.mother_reviews;

create policy "mother reviews public read"
on public.mother_reviews
for select
using (status = 'published' or reviewer_id = auth.uid() or reviewed_id = auth.uid() or public.is_admin());

create policy "mother reviews buyer insert"
on public.mother_reviews
for insert
with check (
  auth.uid() = reviewer_id
  and status = 'published'
  and exists (
    select 1
    from public.conversations c
    join public.products pr on pr.id = c.product_id
    join public.profiles buyer on buyer.id = c.buyer_id
    join public.profiles seller on seller.id = c.seller_id
    where c.id = conversation_id
    and c.product_id is not null
    and c.store_product_id is null
    and c.product_id = mother_reviews.product_id
    and c.buyer_id = auth.uid()
    and c.seller_id = reviewed_id
    and pr.seller_id = reviewed_id
    and buyer.account_type = 'user'
    and seller.account_type = 'user'
    and buyer.status = 'active'
    and seller.status = 'active'
    and exists (
      select 1 from public.messages m
      where m.conversation_id = c.id
    )
  )
);

create policy "mother reviews admin update"
on public.mother_reviews
for update
using (public.is_admin())
with check (public.is_admin());

create policy "mother reviews admin delete"
on public.mother_reviews
for delete
using (public.is_admin());

notify pgrst, 'reload schema';
