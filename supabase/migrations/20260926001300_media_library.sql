-- =============================================================================
-- 1300 MEDIA LIBRARY: folders, original filenames, usage lookup before delete.
-- Files live in storage bucket store-assets under tenant/{tenant_id}/… (storage RLS already
-- enforces the tenant prefix + permission); media_assets is the catalogue of those files.
-- =============================================================================

alter table public.media_assets
  add column filename text check (char_length(filename) <= 200),
  add column folder text not null default 'general' check (folder ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  add column updated_at timestamptz not null default now();
create trigger trg_media_assets_updated_at before update on public.media_assets for each row execute function app.set_updated_at();
create index media_assets_folder_idx on public.media_assets (tenant_id, folder, created_at desc);

-- Existing rows: folder from the upload area in the path (tenant/{id}/{area}/…).
update public.media_assets
set folder = case split_part(storage_path, '/', 3)
  when 'products' then 'products' when 'collections' then 'collections' when 'categories' then 'categories'
  when 'theme' then 'theme' when 'pages' then 'content' when 'blog' then 'content' when 'brand' then 'brand'
  else 'general' end;

-- Theme editors upload images too (storage already allows theme.edit).
drop policy media_assets_staff_write on public.media_assets;
create policy media_assets_staff_write on public.media_assets for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'catalog.write') or app.has_tenant_permission(tenant_id, 'content.write') or app.has_tenant_permission(tenant_id, 'theme.edit'))
  with check (app.has_tenant_permission(tenant_id, 'catalog.write') or app.has_tenant_permission(tenant_id, 'content.write') or app.has_tenant_permission(tenant_id, 'theme.edit'));

-- Where a file is referenced (so the library can warn before deleting). Staff of the tenant only.
create or replace function public.media_usage(p_tenant uuid, p_path text)
returns table (kind text, label text, ref_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.has_tenant_permission(p_tenant, 'store.read') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if split_part(p_path, '/', 2) <> p_tenant::text then
    return;
  end if;
  return query
    select 'product'::text, p.title, p.id::text from public.product_media m join public.products p on p.id = m.product_id where m.tenant_id = p_tenant and m.storage_path = p_path
    union all select 'category', c.name, c.id::text from public.categories c where c.tenant_id = p_tenant and c.image_path = p_path
    union all select 'collection', c.title, c.id::text from public.collections c where c.tenant_id = p_tenant and c.image_path = p_path
    union all select 'menu', i.title, i.id::text from public.menu_items i where i.tenant_id = p_tenant and i.image_path = p_path
    union all select 'blog', b.title, b.id::text from public.blog_posts b where b.tenant_id = p_tenant and (b.cover_path = p_path or position(p_path in b.body::text) > 0)
    union all select 'page', g.title, g.id::text from public.pages g where g.tenant_id = p_tenant and position(p_path in g.body::text) > 0
    union all select 'brand', case when s.logo_path = p_path then 'Store logo' else 'Favicon' end, s.tenant_id::text from public.stores s where s.tenant_id = p_tenant and (s.logo_path = p_path or s.favicon_path = p_path)
    union all select 'theme', case t.status when 'published' then 'Live theme' else 'Theme draft' end, t.id::text from public.theme_versions t
      where t.tenant_id = p_tenant and t.status in ('draft', 'published') and position(p_path in t.config::text) > 0;
end;
$$;
revoke all on function public.media_usage(uuid, text) from public, anon;
grant execute on function public.media_usage(uuid, text) to authenticated;
