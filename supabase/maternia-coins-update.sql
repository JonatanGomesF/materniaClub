-- Execute este SQL no Supabase para ativar as moedas maternia.
-- Regras:
-- 1. Maes recebem 10 moedas ao criar a conta.
-- 2. Somente a propria mae e administradores conseguem ver o saldo.
-- 3. Somente administradores conseguem adicionar moedas.

create extension if not exists "pgcrypto";

create table if not exists public.maternia_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance integer not null default 10 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.maternia_coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null default 'Ajuste administrativo',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists maternia_wallets_updated_at on public.maternia_wallets;
create trigger maternia_wallets_updated_at
before update on public.maternia_wallets
for each row execute function public.set_updated_at();

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

drop trigger if exists ensure_maternia_wallet_on_profile on public.profiles;
create trigger ensure_maternia_wallet_on_profile
after insert or update of account_type on public.profiles
for each row execute function public.ensure_maternia_wallet();

insert into public.maternia_wallets (user_id, balance)
select p.id, 10
from public.profiles p
where p.account_type = 'user'
on conflict (user_id) do nothing;

alter table public.maternia_wallets enable row level security;
alter table public.maternia_coin_transactions enable row level security;

drop policy if exists "wallets owner or admin read" on public.maternia_wallets;
drop policy if exists "wallets admin write" on public.maternia_wallets;
drop policy if exists "coin transactions owner or admin read" on public.maternia_coin_transactions;
drop policy if exists "coin transactions admin insert" on public.maternia_coin_transactions;

create policy "wallets owner or admin read"
on public.maternia_wallets
for select
using (
  public.is_admin()
  or (
    user_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = user_id
      and p.account_type = 'user'
    )
  )
);

create policy "wallets admin write"
on public.maternia_wallets
for all
using (public.is_admin())
with check (public.is_admin());

create policy "coin transactions owner or admin read"
on public.maternia_coin_transactions
for select
using (
  public.is_admin()
  or (
    user_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = user_id
      and p.account_type = 'user'
    )
  )
);

create policy "coin transactions admin insert"
on public.maternia_coin_transactions
for insert
with check (public.is_admin());

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

revoke all on function public.admin_add_maternia_coins(uuid, integer, text) from public;
grant execute on function public.admin_add_maternia_coins(uuid, integer, text) to authenticated;

notify pgrst, 'reload schema';
