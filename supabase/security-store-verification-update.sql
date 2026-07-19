-- Execute este SQL no Supabase para proteger permissoes e ativar verificacao real de lojas.

-- Remove protecoes antigas antes da migracao de status.
-- Sem isso, lojas antigas com status "active" nao conseguem virar "verified".
drop trigger if exists protect_store_approval_status on public.stores;
drop trigger if exists protect_store_status on public.stores;
drop function if exists public.protect_store_approval_status();

alter table public.stores
drop constraint if exists stores_status_check;

alter table public.stores
alter column status set default 'pending';

update public.stores
set status = 'verified'
where status = 'active';

alter table public.stores
add constraint stores_status_check
check (status in ('pending', 'verified', 'rejected', 'suspended', 'hidden', 'removed'));

alter table public.store_products
drop constraint if exists store_products_status_check;

alter table public.store_products
add constraint store_products_status_check
check (status in ('active', 'sold', 'hidden', 'removed'));

alter table public.reports
drop constraint if exists reports_target_type_check;

alter table public.reports
add constraint reports_target_type_check
check (target_type in ('post', 'product', 'store_product', 'store', 'comment', 'profile'));

create or replace function public.protect_profile_sensitive_fields()
returns trigger as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.account_type is distinct from old.account_type
    or new.role is distinct from old.role
    or new.status is distinct from old.status then
    raise exception 'account_type, role e status so podem ser alterados por administradores';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_profile_sensitive_fields on public.profiles;
create trigger protect_profile_sensitive_fields
before update of account_type, role, status on public.profiles
for each row execute function public.protect_profile_sensitive_fields();

create or replace function public.protect_store_status()
returns trigger as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'status da loja so pode ser alterado por administradores';
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists protect_store_status on public.stores;
create trigger protect_store_status
before update of status on public.stores
for each row execute function public.protect_store_status();

drop policy if exists "profiles owner update" on public.profiles;
create policy "profiles owner update"
on public.profiles
for update
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

drop policy if exists "stores public read" on public.stores;
drop policy if exists "stores owner insert" on public.stores;
drop policy if exists "stores owner update" on public.stores;
drop policy if exists "stores owner delete" on public.stores;

create policy "stores public read"
on public.stores
for select
using (status = 'verified' or owner_id = auth.uid() or public.is_admin());

create policy "stores owner insert"
on public.stores
for insert
with check (
  auth.uid() = owner_id
  and status = 'pending'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
    and p.account_type = 'store'
    and p.status = 'active'
  )
);

create policy "stores owner update"
on public.stores
for update
using (auth.uid() = owner_id or public.is_admin())
with check (auth.uid() = owner_id or public.is_admin());

create policy "stores owner delete"
on public.stores
for delete
using (public.is_admin());

drop policy if exists "store products public read" on public.store_products;
drop policy if exists "store products owner insert" on public.store_products;
drop policy if exists "store products owner update" on public.store_products;
drop policy if exists "store products owner delete" on public.store_products;

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

create policy "store products owner insert"
on public.store_products
for insert
with check (
  exists (
    select 1 from public.stores s
    join public.profiles p on p.id = s.owner_id
    where s.id = store_id
    and s.owner_id = auth.uid()
    and s.status = 'verified'
    and p.account_type = 'store'
    and p.status = 'active'
  )
);

create policy "store products owner update"
on public.store_products
for update
using (
  public.is_admin()
  or exists (
    select 1 from public.stores s
    where s.id = store_id
    and s.owner_id = auth.uid()
    and s.status = 'verified'
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.stores s
    where s.id = store_id
    and s.owner_id = auth.uid()
    and s.status = 'verified'
  )
);

create policy "store products owner delete"
on public.store_products
for delete
using (
  public.is_admin()
  or exists (
    select 1 from public.stores s
    where s.id = store_id
    and s.owner_id = auth.uid()
    and s.status = 'verified'
  )
);

drop policy if exists "posts owner insert" on public.posts;
create policy "posts owner insert"
on public.posts
for insert
with check (
  auth.uid() = author_id
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
    and p.account_type = 'user'
    and p.status = 'active'
  )
);

drop policy if exists "products owner insert" on public.products;
create policy "products owner insert"
on public.products
for insert
with check (
  auth.uid() = seller_id
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
    and p.account_type = 'user'
    and p.status = 'active'
  )
);

notify pgrst, 'reload schema';
