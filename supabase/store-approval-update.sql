-- Execute uma vez no SQL Editor do Supabase.
-- Adiciona o fluxo: cadastro -> em analise -> aprovado/recusado pelo admin.

alter table public.stores drop constraint if exists stores_status_check;
alter table public.stores
  add constraint stores_status_check
  check (status in ('pending', 'verified', 'rejected', 'suspended', 'hidden', 'removed'));

alter table public.stores alter column status set default 'pending';

-- Cadastros antigos aprovados devem ser migrados para verified.

create or replace function public.handle_new_maternia_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_type text := coalesce(new.raw_user_meta_data->>'account_type', 'user');
begin
  insert into public.profiles (id, full_name, city, account_type, status)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1), 'Usuaria'),
    nullif(new.raw_user_meta_data->>'city', ''),
    case when requested_type = 'store' then 'store' else 'user' end,
    'active'
  )
  on conflict (id) do nothing;

  if requested_type = 'store' then
    insert into public.stores (owner_id, name, cnpj, city, status)
    values (
      new.id,
      coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), 'Loja parceira'),
      regexp_replace(coalesce(new.raw_user_meta_data->>'cnpj', ''), '\D', '', 'g'),
      nullif(new.raw_user_meta_data->>'city', ''),
      'pending'
    )
    on conflict (owner_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_maternia on auth.users;
create trigger on_auth_user_created_maternia
  after insert on auth.users
  for each row execute function public.handle_new_maternia_user();

drop policy if exists "stores public read" on public.stores;
drop policy if exists "stores approved or related read" on public.stores;
create policy "stores approved or related read" on public.stores for select using (
  status = 'verified' or owner_id = auth.uid() or public.is_admin()
);

drop policy if exists "stores owner insert" on public.stores;
drop policy if exists "stores owner pending insert" on public.stores;
create policy "stores owner pending insert" on public.stores for insert with check (
  auth.uid() = owner_id and status = 'pending'
);

drop policy if exists "stores owner update" on public.stores;
drop policy if exists "stores owner or admin update" on public.stores;
create policy "stores owner or admin update" on public.stores for update
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

-- Mesmo alterando a requisicao manualmente, o dono nao consegue se aprovar.
create or replace function public.protect_store_approval_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status and not public.is_admin() then
    raise exception 'Somente a administracao pode alterar a aprovacao da loja';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_store_approval_status on public.stores;
create trigger protect_store_approval_status
  before update of status on public.stores
  for each row execute function public.protect_store_approval_status();

drop policy if exists "store products owner insert" on public.store_products;
drop policy if exists "approved store products owner insert" on public.store_products;
create policy "approved store products owner insert" on public.store_products for insert with check (
  exists (
    select 1 from public.stores s
    where s.id = store_id and s.owner_id = auth.uid() and s.status = 'verified'
  )
);

notify pgrst, 'reload schema';
