alter table public.comments alter column post_id drop not null;
alter table public.comments add column if not exists product_id uuid references public.products(id) on delete cascade;
alter table public.comments add column if not exists store_product_id uuid references public.store_products(id) on delete cascade;

alter table public.comments drop constraint if exists comments_single_target;
alter table public.comments add constraint comments_single_target
check (num_nonnulls(post_id, product_id, store_product_id) = 1);

drop policy if exists "comments owner delete" on public.comments;
create policy "comments owner delete" on public.comments
for delete using (user_id = auth.uid() or public.is_admin());
