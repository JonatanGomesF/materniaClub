-- ==============================================================================
-- materniaClub - SCHEMA COMPLETO E DEFINITIVO PARA SUPABASE
-- ==============================================================================
-- Este arquivo recria todo o banco de dados do materniaClub do zero com:
-- 1. Tabelas de Mães, Lojas Parceiras, Feed, Marketplace, Chat, Amizades, Avaliações e Moedas
-- 2. Gatilho automático de criação de perfil ao cadastrar no Supabase Auth
-- 3. Políticas de Segurança RLS (Row Level Security) completas e testadas
-- 4. Funções e Triggers de proteção de permissões e aprovação de lojas
-- 5. Bucket de Mídia ('maternia-media') e configuração do Supabase Realtime
--
-- COMO EXECUTAR:
-- Abra o dashboard do seu Supabase -> Vá em "SQL Editor" -> Cole este script -> Clique em "Run".
-- ==============================================================================

-- 1. EXTENSÕES
create extension if not exists "pgcrypto";

-- 2. LIMPEZA PREVENTIVA (DROP CASCADE)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.protect_profile_sensitive_fields() cascade;
drop function if exists public.protect_store_status() cascade;
drop function if exists public.ensure_maternia_wallet() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.admin_add_maternia_coins(uuid, integer, text) cascade;
drop function if exists public.set_updated_at() cascade;

drop table if exists public.messages cascade;
drop table if exists public.store_reviews cascade;
drop table if exists public.mother_reviews cascade;
drop table if exists public.conversations cascade;
drop table if exists public.friendships cascade;
drop table if exists public.comments cascade;
drop table if exists public.likes cascade;
drop table if exists public.product_likes cascade;
drop table if exists public.store_products cascade;
drop table if exists public.stores cascade;
drop table if exists public.products cascade;
drop table if exists public.posts cascade;
drop table if exists public.categories cascade;
drop table if exists public.reports cascade;
drop table if exists public.maternia_coin_transactions cascade;
drop table if exists public.maternia_wallets cascade;
drop table if exists public.profiles cascade;

-- ==============================================================================
-- 3. CRIAÇÃO DAS TABELAS
-- ==============================================================================

-- TABELA: PROFILES (Perfis de Mães e Donos de Lojas)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  city text,
  hometown text,
  birth_date date,
  relationship_status text check (
    relationship_status is null
    or relationship_status in ('relacionamento_serio', 'casada', 'solteira', 'noiva', 'prefere_nao_dizer')
  ),
  bio text,
  avatar_url text,
  account_type text not null default 'user' check (account_type in ('user', 'store')),
  motherhood_stage text default 'gestante' check (motherhood_stage in ('gestante', 'mae_primeira_viagem', 'mae_experiente', 'tentante')),
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended', 'banned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TABELA: MATERNIA_WALLETS (Carteira de Moedas das Mães)
create table public.maternia_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance integer not null default 10 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TABELA: MATERNIA_COIN_TRANSACTIONS (Extrato de Transações de Moedas)
create table public.maternia_coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null default 'Ajuste administrativo',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- TABELA: FRIENDSHIPS (Amizades e Conexões entre Mães)
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index friendships_pair_unique on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);

-- TABELA: CATEGORIES (Categorias de Feed e Marketplace)
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('post', 'product', 'both')),
  created_at timestamptz not null default now()
);

-- TABELA: POSTS (Publicações do Feed das Mães)
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  price numeric(10,2) check (price is null or price >= 0),
  image_url text,
  category text not null default 'promocao',
  status text not null default 'published' check (status in ('published', 'sold', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TABELA: PRODUCTS (Marketplace de Desapegos das Mães)
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

-- TABELA: STORES (Lojas Parceiras com Verificação por CNPJ)
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  cnpj text not null,
  city text,
  description text,
  logo_url text,
  cover_url text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'suspended', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id),
  unique (cnpj)
);

-- TABELA: STORE_PRODUCTS (Vitrine de Produtos das Lojas Parceiras)
create table public.store_products (
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

-- TABELA: LIKES (Curtidas de Postagens do Feed)
create table public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  store_product_id uuid references public.store_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

-- TABELA: PRODUCT_LIKES (Curtidas nos Anúncios do Marketplace)
create table public.product_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- TABELA: COMMENTS (Comentários em Posts, Produtos e Vitrines)
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  store_product_id uuid references public.store_products(id) on delete cascade,
  body text not null,
  status text not null default 'published' check (status in ('published', 'sold', 'hidden', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_single_target check (num_nonnulls(post_id, product_id, store_product_id) = 1)
);

-- TABELA: REPORTS (Denúncias para Moderação do Admin)
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('post', 'product', 'store_product', 'store', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- TABELA: CONVERSATIONS (Salas de Conversa no Chat)
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  store_product_id uuid references public.store_products(id) on delete set null,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (product_id, buyer_id, seller_id),
  unique (store_product_id, buyer_id, seller_id)
);

-- TABELA: MESSAGES (Mensagens do Chat)
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- TABELA: MOTHER_REVIEWS (Avaliações entre Mães após Negociação)
create table public.mother_reviews (
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

create index mother_reviews_reviewed_id_idx on public.mother_reviews (reviewed_id, created_at desc);

-- TABELA: STORE_REVIEWS (Avaliações de Clientes para Lojas Parceiras)
create table public.store_reviews (
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

create index store_reviews_store_id_idx on public.store_reviews (store_id, created_at desc);

-- ==============================================================================
-- 4. DADOS INICIAIS (CATEGORIAS)
-- ==============================================================================
insert into public.categories (name, kind) values
  ('fraldas', 'both'),
  ('chupetas', 'product'),
  ('mamadeiras', 'product'),
  ('carrinho', 'product'),
  ('bebe conforto', 'product'),
  ('roupinhas', 'product'),
  ('brinquedos', 'product'),
  ('higiene', 'product'),
  ('promocao', 'post'),
  ('duvida', 'post'),
  ('desapego', 'both'),
  ('experiencia', 'post')
on conflict (name) do nothing;

-- ==============================================================================
-- 5. FUNÇÕES E TRIGGERS DE SISTEMA
-- ==============================================================================

-- Função para atualizar updated_at automaticamente
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create trigger maternia_wallets_updated_at before update on public.maternia_wallets
for each row execute function public.set_updated_at();

create trigger friendships_updated_at before update on public.friendships
for each row execute function public.set_updated_at();

create trigger posts_updated_at before update on public.posts
for each row execute function public.set_updated_at();

create trigger products_updated_at before update on public.products
for each row execute function public.set_updated_at();

create trigger stores_updated_at before update on public.stores
for each row execute function public.set_updated_at();

create trigger store_products_updated_at before update on public.store_products
for each row execute function public.set_updated_at();

create trigger comments_updated_at before update on public.comments
for each row execute function public.set_updated_at();

create trigger mother_reviews_updated_at before update on public.mother_reviews
for each row execute function public.set_updated_at();

create trigger store_reviews_updated_at before update on public.store_reviews
for each row execute function public.set_updated_at();

-- Função para verificar se usuário logado é Admin / Moderador
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role in ('admin', 'moderator')
    and status = 'active'
  );
$$ language sql stable security definer set search_path = public;

-- Gatilho para criar/manter carteira de moedas ao cadastrar mãe
create or replace function public.ensure_maternia_wallet()
returns trigger as $$
begin
  if new.account_type = 'user' then
    insert into public.maternia_wallets (user_id, balance)
    values (new.id, 10)
    on conflict (user_id) do nothing;
  else
    delete from public.maternia_wallets
    where user_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger ensure_maternia_wallet_on_profile
after insert or update of account_type on public.profiles
for each row execute function public.ensure_maternia_wallet();

-- Gatilho automático ao registrar no Auth (cria profile, wallet ou store se for o caso)
create or replace function public.handle_new_user()
returns trigger as $$
declare
  raw_account_type text;
  raw_full_name text;
  raw_city text;
  raw_motherhood_stage text;
  raw_cnpj text;
begin
  raw_account_type := coalesce(new.raw_user_meta_data->>'account_type', 'user');
  raw_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));
  raw_city := new.raw_user_meta_data->>'city';
  raw_motherhood_stage := coalesce(new.raw_user_meta_data->>'motherhood_stage', 'gestante');
  raw_cnpj := new.raw_user_meta_data->>'cnpj';

  insert into public.profiles (
    id,
    full_name,
    city,
    account_type,
    motherhood_stage,
    role,
    status
  ) values (
    new.id,
    raw_full_name,
    raw_city,
    raw_account_type,
    raw_motherhood_stage,
    'user',
    'active'
  )
  on conflict (id) do update
  set full_name = excluded.full_name,
      city = coalesce(excluded.city, public.profiles.city);

  if raw_account_type = 'store' and raw_cnpj is not null and raw_cnpj <> '' then
    insert into public.stores (
      owner_id,
      name,
      cnpj,
      city,
      status
    ) values (
      new.id,
      raw_full_name,
      raw_cnpj,
      raw_city,
      'pending'
    )
    on conflict (owner_id) do nothing;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Proteger campos sensíveis do perfil (role, status, account_type só admin altera)
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
$$ language plpgsql security definer set search_path = public;

create trigger protect_profile_sensitive_fields
before update of account_type, role, status on public.profiles
for each row execute function public.protect_profile_sensitive_fields();

-- Proteger status de aprovação de lojas
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
$$ language plpgsql security definer set search_path = public;

create trigger protect_store_status
before update of status on public.stores
for each row execute function public.protect_store_status();

-- RPC: Admin adiciona moedas maternia
create or replace function public.admin_add_maternia_coins(
  target_user_id uuid,
  amount_to_add integer,
  reason_text text default 'Credito manual do admin'
)
returns integer as $$
declare
  new_balance integer;
  target_account_type text;
  target_status text;
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem adicionar moedas maternia';
  end if;

  if amount_to_add is null or amount_to_add <= 0 then
    raise exception 'Informe uma quantidade positiva de moedas';
  end if;

  select account_type, status
  into target_account_type, target_status
  from public.profiles
  where id = target_user_id;

  if target_account_type is null then
    raise exception 'Usuaria nao encontrada';
  end if;

  if target_account_type <> 'user' then
    raise exception 'Moedas maternia sao exclusivas para maes usuarias';
  end if;

  if target_status <> 'active' then
    raise exception 'Nao e possivel adicionar moedas para uma conta inativa';
  end if;

  insert into public.maternia_wallets (user_id, balance)
  values (target_user_id, 10)
  on conflict (user_id) do nothing;

  update public.maternia_wallets
  set balance = balance + amount_to_add
  where user_id = target_user_id
  returning balance into new_balance;

  insert into public.maternia_coin_transactions (user_id, amount, reason, created_by)
  values (target_user_id, amount_to_add, coalesce(nullif(reason_text, ''), 'Credito manual do admin'), auth.uid());

  return new_balance;
end;
$$ language plpgsql security definer set search_path = public;

-- ==============================================================================
-- 6. HABILITAÇÃO DO ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS
-- ==============================================================================
alter table public.profiles enable row level security;
alter table public.maternia_wallets enable row level security;
alter table public.maternia_coin_transactions enable row level security;
alter table public.friendships enable row level security;
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
alter table public.mother_reviews enable row level security;
alter table public.store_reviews enable row level security;

-- ==============================================================================
-- 7. POLÍTICAS DE SEGURANÇA (RLS POLICIES)
-- ==============================================================================

-- PROFILES
create policy "profiles public read" on public.profiles for select using (status <> 'banned' or public.is_admin());
create policy "profiles owner insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles owner update" on public.profiles for update using (auth.uid() = id or public.is_admin()) with check (auth.uid() = id or public.is_admin());

-- WALLETS
create policy "wallets owner or admin read" on public.maternia_wallets for select using (
  public.is_admin()
  or (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = user_id and p.account_type = 'user')
  )
);
create policy "wallets admin write" on public.maternia_wallets for all using (public.is_admin()) with check (public.is_admin());

-- COIN TRANSACTIONS
create policy "coin transactions owner or admin read" on public.maternia_coin_transactions for select using (
  public.is_admin()
  or (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = user_id and p.account_type = 'user')
  )
);
create policy "coin transactions admin insert" on public.maternia_coin_transactions for insert with check (public.is_admin());

-- FRIENDSHIPS
create policy "friendships participants read" on public.friendships for select using (auth.uid() in (requester_id, addressee_id));
create policy "friendships requester insert" on public.friendships for insert with check (auth.uid() = requester_id and status = 'pending');
create policy "friendships addressee accept" on public.friendships for update using (auth.uid() = addressee_id and status = 'pending') with check (auth.uid() = addressee_id and status = 'accepted');
create policy "friendships participants delete" on public.friendships for delete using (auth.uid() in (requester_id, addressee_id));

-- CATEGORIES
create policy "categories public read" on public.categories for select using (true);
create policy "categories admin write" on public.categories for all using (public.is_admin()) with check (public.is_admin());

-- POSTS (FEED)
create policy "posts public read" on public.posts for select using (status in ('published', 'sold') or author_id = auth.uid() or public.is_admin());
create policy "posts owner insert" on public.posts for insert with check (
  auth.uid() = author_id
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'user' and p.status = 'active')
);
create policy "posts owner update" on public.posts for update using (author_id = auth.uid() or public.is_admin()) with check (author_id = auth.uid() or public.is_admin());
create policy "posts admin delete" on public.posts for delete using (author_id = auth.uid() or public.is_admin());

-- PRODUCTS (MARKETPLACE)
create policy "products public read" on public.products for select using (status in ('active', 'sold') or seller_id = auth.uid() or public.is_admin());
create policy "products owner insert" on public.products for insert with check (
  auth.uid() = seller_id
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'user' and p.status = 'active')
);
create policy "products owner update" on public.products for update using (seller_id = auth.uid() or public.is_admin()) with check (seller_id = auth.uid() or public.is_admin());
create policy "products owner delete" on public.products for delete using (seller_id = auth.uid() or public.is_admin());

-- STORES
create policy "stores public read" on public.stores for select using (status = 'verified' or owner_id = auth.uid() or public.is_admin());
create policy "stores owner insert" on public.stores for insert with check (
  auth.uid() = owner_id
  and status = 'pending'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.account_type = 'store' and p.status = 'active')
);
create policy "stores owner update" on public.stores for update using (auth.uid() = owner_id or public.is_admin()) with check (auth.uid() = owner_id or public.is_admin());
create policy "stores owner delete" on public.stores for delete using (public.is_admin());

-- STORE PRODUCTS
create policy "store products public read" on public.store_products for select using (
  (status in ('active', 'sold') and exists (select 1 from public.stores s where s.id = store_id and s.status = 'verified'))
  or exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid())
  or public.is_admin()
);
create policy "store products owner insert" on public.store_products for insert with check (
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
create policy "store products owner update" on public.store_products for update using (
  public.is_admin()
  or exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid() and s.status = 'verified')
) with check (
  public.is_admin()
  or exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid() and s.status = 'verified')
);
create policy "store products owner delete" on public.store_products for delete using (
  public.is_admin()
  or exists (select 1 from public.stores s where s.id = store_id and s.owner_id = auth.uid() and s.status = 'verified')
);

-- LIKES
create policy "likes public read" on public.likes for select using (true);
create policy "likes owner insert" on public.likes for insert with check (auth.uid() = user_id);
create policy "likes owner delete" on public.likes for delete using (auth.uid() = user_id or public.is_admin());

-- PRODUCT LIKES
create policy "product likes public read" on public.product_likes for select using (true);
create policy "product likes owner insert" on public.product_likes for insert with check (auth.uid() = user_id);
create policy "product likes owner delete" on public.product_likes for delete using (auth.uid() = user_id or public.is_admin());

-- COMMENTS
create policy "comments public read" on public.comments for select using (status = 'published' or user_id = auth.uid() or public.is_admin());
create policy "comments owner insert" on public.comments for insert with check (auth.uid() = user_id);
create policy "comments owner update" on public.comments for update using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "comments owner delete" on public.comments for delete using (user_id = auth.uid() or public.is_admin());

-- REPORTS
create policy "reports owner insert" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "reports admin read" on public.reports for select using (public.is_admin() or auth.uid() = reporter_id);
create policy "reports admin update" on public.reports for update using (public.is_admin()) with check (public.is_admin());

-- CONVERSATIONS
create policy "conversations participants" on public.conversations for select using (auth.uid() in (buyer_id, seller_id) or public.is_admin());
create policy "conversations participant insert" on public.conversations for insert with check (auth.uid() in (buyer_id, seller_id));

-- MESSAGES
create policy "messages participants read" on public.messages for select using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
    and auth.uid() in (c.buyer_id, c.seller_id)
  ) or public.is_admin()
);
create policy "messages sender insert" on public.messages for insert with check (auth.uid() = sender_id);
create policy "messages recipient mark read" on public.messages for update using (
  sender_id <> auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
    and auth.uid() in (c.buyer_id, c.seller_id)
  )
) with check (
  sender_id <> auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
    and auth.uid() in (c.buyer_id, c.seller_id)
  )
);

-- MOTHER REVIEWS
create policy "mother reviews public read" on public.mother_reviews for select using (status = 'published' or reviewer_id = auth.uid() or reviewed_id = auth.uid() or public.is_admin());
create policy "mother reviews buyer insert" on public.mother_reviews for insert with check (
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
    and exists (select 1 from public.messages m where m.conversation_id = c.id)
  )
);
create policy "mother reviews admin update" on public.mother_reviews for update using (public.is_admin()) with check (public.is_admin());
create policy "mother reviews admin delete" on public.mother_reviews for delete using (public.is_admin());

-- STORE REVIEWS
create policy "store reviews public read" on public.store_reviews for select using (status = 'published' or reviewer_id = auth.uid() or public.is_admin());
create policy "store reviews buyer insert" on public.store_reviews for insert with check (
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
    and exists (select 1 from public.messages m where m.conversation_id = c.id)
  )
);
create policy "store reviews admin update" on public.store_reviews for update using (public.is_admin()) with check (public.is_admin());
create policy "store reviews admin delete" on public.store_reviews for delete using (public.is_admin());

-- ==============================================================================
-- 8. STORAGE (BUCKET 'maternia-media' E POLÍTICAS)
-- ==============================================================================
insert into storage.buckets (id, name, public)
values ('maternia-media', 'maternia-media', true)
on conflict (id) do nothing;

drop policy if exists "media public read" on storage.objects;
drop policy if exists "media authenticated upload" on storage.objects;
drop policy if exists "media owner update" on storage.objects;
drop policy if exists "media owner delete" on storage.objects;

create policy "media public read" on storage.objects for select using (bucket_id = 'maternia-media');
create policy "media authenticated upload" on storage.objects for insert with check (bucket_id = 'maternia-media' and auth.role() = 'authenticated');
create policy "media owner update" on storage.objects for update using (bucket_id = 'maternia-media' and owner = auth.uid());
create policy "media owner delete" on storage.objects for delete using (bucket_id = 'maternia-media' and (owner = auth.uid() or public.is_admin()));

-- ==============================================================================
-- 9. CONFIGURAÇÃO DO REALTIME
-- ==============================================================================
do $$
declare
  t text;
  tables text[] := array[
    'posts', 'likes', 'products', 'product_likes', 
    'stores', 'store_products', 'conversations', 
    'messages', 'maternia_wallets', 'comments', 'friendships'
  ];
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' 
      and schemaname = 'public' 
      and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Permissões de RPC
revoke all on function public.admin_add_maternia_coins(uuid, integer, text) from public;
grant execute on function public.admin_add_maternia_coins(uuid, integer, text) to authenticated;

notify pgrst, 'reload schema';

-- ==============================================================================
-- DICA: Como se tornar Administrador(a) no materniaClub:
-- Depois de criar sua conta, execute a linha abaixo no SQL Editor substituindo pelo seu e-mail:
--
-- UPDATE public.profiles
-- SET role = 'admin'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'SEU_EMAIL_AQUI');
-- ==============================================================================
