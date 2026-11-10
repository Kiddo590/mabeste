-- Product image uploads. Bucket is public: product photos aren't sensitive
-- (the app already links to fully-public external photo URLs today), and
-- public read means next/image and <img> just hit the CDN public-URL
-- endpoint with no signed-URL/token-refresh machinery.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- storage.objects policies don't reliably inherit the public search_path,
-- so current_staff_role() is schema-qualified here (unlike its call sites
-- in 0001_init.sql's own public-schema policies).
create policy product_images_select on storage.objects for select
  using (bucket_id = 'product-images' and public.current_staff_role() in ('admin', 'cashier'));

create policy product_images_admin_insert on storage.objects for insert
  with check (bucket_id = 'product-images' and public.current_staff_role() = 'admin');

create policy product_images_admin_update on storage.objects for update
  using (bucket_id = 'product-images' and public.current_staff_role() = 'admin');

create policy product_images_admin_delete on storage.objects for delete
  using (bucket_id = 'product-images' and public.current_staff_role() = 'admin');
