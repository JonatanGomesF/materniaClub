alter table public.conversations
add column if not exists store_product_id uuid references public.store_products(id) on delete set null;

create unique index if not exists conversations_store_product_buyer_seller_key
on public.conversations (store_product_id, buyer_id, seller_id)
where store_product_id is not null;
