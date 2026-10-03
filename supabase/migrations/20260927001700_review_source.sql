-- 1700 REVIEW SOURCE: where a review came from. "sample" reviews are placeholders for layout
-- previews; the storefront labels them and the dashboard can remove them in one click.
alter table public.reviews
  add column if not exists source text not null default 'customer' check (source in ('customer', 'sample', 'import'));
create index if not exists reviews_source_idx on public.reviews (tenant_id, source) where source <> 'customer';
