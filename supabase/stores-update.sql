-- Execute este SQL no Supabase para ativar a aba Lojas.

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  cnpj text,
  city text,
  description text,
  logo_url text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'suspended', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id)
);

alter table public.stores
add column if not exists cnpj text;

alter table public.profiles
add column if not exists account_type text not null default 'user';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_account_type_check'
  ) then
    alter table public.profiles
    add constraint profiles_account_type_check check (account_type in ('user', 'store'));
  end if;
end $$;

alter table public.stores
add column if not exists logo_url text;

alter table public.stores
add column if not exists cover_url text;

create unique index if not exists stores_cnpj_unique
on public.stores (cnpj)
where cnpj is not null;

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  category text not null,
  city text,
  image_url text,
  status text not null default 'active' check (status in ('active', 'sold', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stores enable row level security;
alter table public.store_products enable row level security;

drop policy if exists "stores public read" on public.stores;
drop policy if exists "stores owner insert" on public.stores;
drop policy if exists "stores owner update" on public.stores;
drop policy if exists "stores owner delete" on public.stores;
drop policy if exists "store products public read" on public.store_products;
drop policy if exists "store products owner insert" on public.store_products;
drop policy if exists "store products owner update" on public.store_products;
drop policy if exists "store products owner delete" on public.store_products;

create policy "stores public read" on public.stores for select using (status = 'verified' or owner_id = auth.uid() or public.is_admin());
create policy "stores owner insert" on public.stores for insert with check (auth.uid() = owner_id);
create policy "stores owner update" on public.stores for update using (auth.uid() = owner_id or public.is_admin()) with check (auth.uid() = owner_id or public.is_admin());
create policy "stores owner delete" on public.stores for delete using (auth.uid() = owner_id or public.is_admin());

create policy "store products public read" on public.store_products for select using (
  status in ('active', 'sold')
  or exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  or public.is_admin()
);

create policy "store products owner insert" on public.store_products for insert with check (
  exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
);

create policy "store products owner update" on public.store_products for update using (
  exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  or public.is_admin()
) with check (
  exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  or public.is_admin()
);

create policy "store products owner delete" on public.store_products for delete using (
  exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  or public.is_admin()
);

notify pgrst, 'reload schema';
