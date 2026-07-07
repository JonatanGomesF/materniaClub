-- Execute este SQL no Supabase se voce ja aplicou o schema anterior.
-- Ele adiciona localizacao aos anuncios e permite a usuaria excluir os proprios anuncios.

alter table public.products
add column if not exists latitude double precision,
add column if not exists longitude double precision;

drop policy if exists "products admin delete" on public.products;
drop policy if exists "products owner delete" on public.products;

create policy "products owner delete"
on public.products
for delete
using (seller_id = auth.uid() or public.is_admin());
