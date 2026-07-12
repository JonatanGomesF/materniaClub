drop policy if exists "messages recipient mark read" on public.messages;

create policy "messages recipient mark read"
on public.messages for update
using (
  sender_id <> auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
    and auth.uid() in (c.buyer_id, c.seller_id)
  )
)
with check (
  sender_id <> auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
    and auth.uid() in (c.buyer_id, c.seller_id)
  )
);
