create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_unique on public.friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);

alter table public.friendships enable row level security;

drop policy if exists "friendships participants read" on public.friendships;
drop policy if exists "friendships requester insert" on public.friendships;
drop policy if exists "friendships addressee accept" on public.friendships;
drop policy if exists "friendships participants delete" on public.friendships;

create policy "friendships participants read" on public.friendships
for select using (auth.uid() in (requester_id, addressee_id));

create policy "friendships requester insert" on public.friendships
for insert with check (auth.uid() = requester_id and status = 'pending');

create policy "friendships addressee accept" on public.friendships
for update using (auth.uid() = addressee_id and status = 'pending')
with check (auth.uid() = addressee_id and status = 'accepted');

create policy "friendships participants delete" on public.friendships
for delete using (auth.uid() in (requester_id, addressee_id));
