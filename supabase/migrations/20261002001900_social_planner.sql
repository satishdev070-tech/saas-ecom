-- Social planner (additive): campaigns, saved hashtag sets, key marketing dates, and planning
-- fields on social_posts. Planned channels (whatsapp, x, linkedin, threads, youtube) are NOT
-- auto-published: they appear on the calendar and the seller marks them posted (manual_done).
-- Status 'planned' = on the calendar at scheduled_at but never claimed by the publish cron.

create table public.social_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  goal text check (char_length(goal) <= 300),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create table public.social_hashtag_sets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  tags text[] not null default '{}' check (cardinality(tags) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.marketing_dates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  on_date date not null,
  kind text not null default 'other' check (kind in ('sale', 'launch', 'festival', 'other')),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_posts drop constraint if exists social_posts_platforms_check;
alter table public.social_posts add constraint social_posts_platforms_check
  check (platforms <@ array['facebook', 'instagram', 'pinterest', 'whatsapp', 'x', 'linkedin', 'threads', 'youtube']::text[]);
alter table public.social_posts drop constraint if exists social_posts_status_check;
alter table public.social_posts add constraint social_posts_status_check
  check (status in ('draft', 'planned', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'));
alter table public.social_posts
  add column title text check (char_length(title) <= 120),
  add column notes text check (char_length(notes) <= 2000),
  add column pillar text check (pillar in ('product', 'offer', 'behind_scenes', 'education', 'customer', 'festive', 'announcement')),
  add column campaign_id uuid,
  add column manual_done text[] not null default '{}',
  add constraint social_posts_campaign_fk foreign key (tenant_id, campaign_id) references public.social_campaigns (tenant_id, id) on delete set null (campaign_id);
create index social_posts_calendar_idx on public.social_posts (tenant_id, scheduled_at);
create index marketing_dates_tenant_idx on public.marketing_dates (tenant_id, on_date);

create trigger trg_social_campaigns_updated_at before update on public.social_campaigns for each row execute function app.set_updated_at();
create trigger trg_social_hashtag_sets_updated_at before update on public.social_hashtag_sets for each row execute function app.set_updated_at();
create trigger trg_marketing_dates_updated_at before update on public.marketing_dates for each row execute function app.set_updated_at();

alter table public.social_campaigns enable row level security;
alter table public.social_hashtag_sets enable row level security;
alter table public.marketing_dates enable row level security;
create policy social_campaigns_read on public.social_campaigns for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
create policy social_campaigns_write on public.social_campaigns for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'marketing.write')) with check (app.has_tenant_permission(tenant_id, 'marketing.write'));
create policy social_hashtag_sets_read on public.social_hashtag_sets for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
create policy social_hashtag_sets_write on public.social_hashtag_sets for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'marketing.write')) with check (app.has_tenant_permission(tenant_id, 'marketing.write'));
create policy marketing_dates_read on public.marketing_dates for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
create policy marketing_dates_write on public.marketing_dates for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'marketing.write')) with check (app.has_tenant_permission(tenant_id, 'marketing.write'));
grant select, insert, update, delete on public.social_campaigns, public.social_hashtag_sets, public.marketing_dates to authenticated;
grant all on public.social_campaigns, public.social_hashtag_sets, public.marketing_dates to service_role;

-- Down: drop the three tables, the five social_posts columns, the two indexes, and restore the
-- original platforms/status checks (only after removing rows that use the new values).
