-- Execute este SQL no Supabase para permitir marcar produtos de lojas como vendidos.

alter table public.store_products
drop constraint if exists store_products_status_check;

alter table public.store_products
add constraint store_products_status_check
check (status in ('active', 'sold', 'hidden', 'removed'));

drop policy if exists "store products public read" on public.store_products;

create policy "store products public read"
on public.store_products
for select
using (
  (
    status in ('active', 'sold')
    and exists (select 1 from public.stores s where s.id = store_id and s.status = 'verified')
  )
  or exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  or public.is_admin()
);

drop policy if exists "products public read" on public.products;

create policy "products public read"
on public.products
for select
using (
  status in ('active', 'sold')
  or seller_id = auth.uid()
  or public.is_admin()
);

notify pgrst, 'reload schema';
