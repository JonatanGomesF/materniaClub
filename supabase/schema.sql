-- materniaClub Supabase reset + schema
-- Execute este arquivo no SQL Editor do Supabase em um projeto novo ou de testes.
-- Ele remove as tabelas do app antigo e cria o modelo social/marketplace/admin.

drop table if exists public.messages cascade;
drop table if exists public.conversations cascade;
drop table if exists public.store_products cascade;
drop table if exists public.stores cascade;
drop table if exists public.product_images cascade;
drop table if exists public.deal_alerts cascade;
drop table if exists public.reports cascade;
drop table if exists public.comments cascade;
drop table if exists public.likes cascade;
drop table if exists public.product_likes cascade;
drop table if exists public.products cascade;
drop table if exists public.posts cascade;
drop table if exists public.categories cascade;
drop table if exists public.profiles cascade;

create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  city text,
  bio text,
  avatar_url text,
  motherhood_stage text default 'gestante' check (motherhood_stage in ('gestante', 'mae_primeira_viagem', 'mae_experiente', 'tentante')),
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended', 'banned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('post', 'product', 'both')),
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  image_url text,
  category text not null default 'promocao',
  status text not null default 'published' check (status in ('published', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  category text not null,
  condition text not null default 'seminovo' check (condition in ('novo', 'seminovo', 'usado')),
  city text,
  latitude double precision,
  longitude double precision,
  image_url text,
  status text not null default 'active' check (status in ('active', 'sold', 'expired', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  cnpj text not null,
  city text,
  description text,
  logo_url text,
  status text not null default 'active' check (status in ('active', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id),
  unique (cnpj)
);

create table public.store_products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  title text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  category text not null,
  city text,
  image_url text,
  status text not null default 'active' check (status in ('active', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create table public.product_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  body text not null,
  status text not null default 'published' check (status in ('published', 'hidden', 'removed')),
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('post', 'product', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (product_id, buyer_id, seller_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.categories (name, kind) values
  ('fraldas', 'both'),
  ('chupetas', 'product'),
  ('mamadeiras', 'product'),
  ('carrinho', 'product'),
  ('bebe conforto', 'product'),
  ('roupinhas', 'product'),
  ('promocao', 'post'),
  ('duvida', 'post'),
  ('desapego', 'both'),
  ('experiencia', 'post');

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger posts_updated_at before update on public.posts
for each row execute function public.set_updated_at();

create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();

create trigger stores_updated_at before update on public.stores
for each row execute function public.set_updated_at();

create trigger store_products_updated_at before update on public.store_products
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('admin', 'moderator')
    and status = 'active'
  );
$$ language sql stable security definer;

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.posts enable row level security;
alter table public.products enable row level security;
alter table public.stores enable row level security;
alter table public.store_products enable row level security;
alter table public.likes enable row level security;
alter table public.product_likes enable row level security;
alter table public.comments enable row level security;
alter table public.reports enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

create policy "profiles public read" on public.profiles for select using (status <> 'banned' or public.is_admin());
create policy "profiles owner insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles owner update" on public.profiles for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin());

create policy "categories public read" on public.categories for select using (true);
create policy "categories admin write" on public.categories for all using (public.is_admin()) with check (public.is_admin());

create policy "posts public read" on public.posts for select using (status = 'published' or author_id = auth.uid() or public.is_admin());
create policy "posts owner insert" on public.posts for insert with check (auth.uid() = author_id and exists (select 1 from public.profiles where id = auth.uid() and status = 'active'));
create policy "posts owner update" on public.posts for update using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());
create policy "posts admin delete" on public.posts for delete using (public.is_admin());

create policy "products public read" on public.products for select using (status = 'active' or seller_id = auth.uid() or public.is_admin());
create policy "products owner insert" on public.products for insert with check (auth.uid() = seller_id and exists (select 1 from public.profiles where id = auth.uid() and status = 'active'));
create policy "products owner update" on public.products for update using (seller_id = auth.uid() or public.is_admin()) with check (seller_id = auth.uid() or public.is_admin());
create policy "products owner delete" on public.products for delete using (seller_id = auth.uid() or public.is_admin());

create policy "stores public read" on public.stores for select using (status = 'active' or owner_id = auth.uid() or public.is_admin());
create policy "stores owner insert" on public.stores for insert with check (auth.uid() = owner_id);
create policy "stores owner update" on public.stores for update using (auth.uid() = owner_id or public.is_admin()) with check (auth.uid() = owner_id or public.is_admin());
create policy "stores owner delete" on public.stores for delete using (auth.uid() = owner_id or public.is_admin());

create policy "store products public read" on public.store_products for select using (
  status = 'active'
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

create policy "likes owner read" on public.likes for select using (true);
create policy "likes owner insert" on public.likes for insert with check (auth.uid() = user_id);
create policy "likes owner delete" on public.likes for delete using (auth.uid() = user_id or public.is_admin());

create policy "product likes public read" on public.product_likes for select using (true);
create policy "product likes owner insert" on public.product_likes for insert with check (auth.uid() = user_id);
create policy "product likes owner delete" on public.product_likes for delete using (auth.uid() = user_id or public.is_admin());

create policy "comments public read" on public.comments for select using (status = 'published' or user_id = auth.uid() or public.is_admin());
create policy "comments owner insert" on public.comments for insert with check (auth.uid() = user_id);
create policy "comments owner update" on public.comments for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy "reports owner insert" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "reports admin read" on public.reports for select using (public.is_admin() or auth.uid() = reporter_id);
create policy "reports admin update" on public.reports for update using (public.is_admin()) with check (public.is_admin());

create policy "conversations participants" on public.conversations for select using (auth.uid() in (buyer_id, seller_id) or public.is_admin());
create policy "conversations participant insert" on public.conversations for insert with check (auth.uid() in (buyer_id, seller_id));

create policy "messages participants read" on public.messages for select using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
    and auth.uid() in (c.buyer_id, c.seller_id)
  ) or public.is_admin()
);
create policy "messages sender insert" on public.messages for insert with check (auth.uid() = sender_id);

insert into storage.buckets (id, name, public)
values ('maternia-media', 'maternia-media', true)
on conflict (id) do nothing;

create policy "media public read" on storage.objects for select using (bucket_id = 'maternia-media');
create policy "media authenticated upload" on storage.objects for insert with check (bucket_id = 'maternia-media' and auth.role() = 'authenticated');
create policy "media owner update" on storage.objects for update using (bucket_id = 'maternia-media' and owner = auth.uid());
create policy "media owner delete" on storage.objects for delete using (bucket_id = 'maternia-media' and (owner = auth.uid() or public.is_admin()));

-- Depois que voce criar sua conta, rode isto trocando o email para virar admin:
-- update public.profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'seu-email@exemplo.com');
