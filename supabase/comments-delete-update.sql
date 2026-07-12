drop policy if exists "comments owner delete" on public.comments;

create policy "comments owner delete"
on public.comments for delete
using (user_id = auth.uid() or public.is_admin());
