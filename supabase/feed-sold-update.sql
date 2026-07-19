-- Execute este SQL no Supabase para permitir marcar publicacoes do Feed como vendidas.

alter table public.posts
drop constraint if exists posts_status_check;

alter table public.posts
add constraint posts_status_check
check (status in ('published', 'sold', 'hidden', 'removed'));

drop policy if exists "posts public read" on public.posts;

create policy "posts public read"
on public.posts
for select
using (
  status in ('published', 'sold')
  or author_id = auth.uid()
  or public.is_admin()
);

notify pgrst, 'reload schema';
