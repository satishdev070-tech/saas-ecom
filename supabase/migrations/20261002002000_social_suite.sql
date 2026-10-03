-- Social suite (additive): platform OAuth app credentials, unified inbox (Messenger, Instagram
-- DMs, WhatsApp Cloud API), Neural Pulse AI content (brand profile + generation log), and Google
-- Business Profile (connection, reviews cache, 'google' local posts).

-- 1. Platform app credentials (super admin enters Meta / Pinterest / Google / AI keys in the
--    console instead of env vars). Ciphertext only; RLS on with NO policies: only the server's
--    secret-key client (after a platform permission check) reads or writes this table.
create table public.platform_app_credentials (
  provider text primary key check (provider in ('meta', 'pinterest', 'google', 'whatsapp', 'gemini', 'groq', 'anthropic')),
  client_id text check (char_length(client_id) <= 300),
  secret_ciphertext text,
  extra jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.platform_app_credentials enable row level security;
grant all on public.platform_app_credentials to service_role;

-- 2. New tenant integration providers: WhatsApp Business (Cloud API) and Google Business Profile.
alter table public.tenant_integrations drop constraint if exists tenant_integrations_provider_check;
alter table public.tenant_integrations add constraint tenant_integrations_provider_check
  check (provider in ('razorpay', 'cashfree', 'payu', 'shiprocket', 'delhivery', 'ga4', 'google_ads', 'meta_pixel', 'facebook', 'instagram', 'pinterest', 'youtube', 'whatsapp', 'google_business'));

-- 3. Unified inbox. Rows arrive from verified webhooks (server, secret-key client) and from
--    replies sent by staff; staff with marketing permissions read them through RLS.
create table public.social_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  channel text not null check (channel in ('facebook', 'instagram', 'whatsapp')),
  external_thread_id text not null check (char_length(external_thread_id) <= 200),
  participant_id text not null check (char_length(participant_id) <= 200),
  participant_name text check (char_length(participant_name) <= 200),
  last_message_at timestamptz,
  last_inbound_at timestamptz,
  last_preview text check (char_length(last_preview) <= 300),
  unread_count int not null default 0 check (unread_count >= 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, channel, external_thread_id)
);
create table public.social_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  body text not null default '' check (char_length(body) <= 4096),
  media_url text check (char_length(media_url) <= 1000),
  external_id text check (char_length(external_id) <= 200),
  status text not null default 'received' check (status in ('received', 'sending', 'sent', 'failed')),
  error text check (char_length(error) <= 500),
  sent_by uuid references auth.users (id) on delete set null,
  sent_at timestamptz not null default now(),
  foreign key (tenant_id, conversation_id) references public.social_conversations (tenant_id, id) on delete cascade,
  unique (tenant_id, external_id)
);
create index social_conversations_inbox_idx on public.social_conversations (tenant_id, last_message_at desc);
create index social_messages_thread_idx on public.social_messages (conversation_id, sent_at);

-- 4. Neural Pulse: brand profile (one per store) + generation log (history, usage limits).
create table public.brand_profiles (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  voice text check (char_length(voice) <= 500),
  audience text check (char_length(audience) <= 500),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 30),
  dos text check (char_length(dos) <= 1000),
  donts text check (char_length(donts) <= 1000),
  languages text[] not null default '{en}' check (cardinality(languages) <= 5),
  updated_at timestamptz not null default now()
);
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  kind text not null check (kind in ('caption', 'hashtags', 'ideas', 'plan', 'review_reply', 'message_reply', 'profile')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  provider text not null check (char_length(provider) <= 40),
  model text check (char_length(model) <= 100),
  tokens int,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_generations_tenant_idx on public.ai_generations (tenant_id, created_at desc);

-- 5. Google Business Profile reviews cache (synced from the API; replies go back through it).
create table public.gbp_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  location_name text not null check (char_length(location_name) <= 200),
  review_id text not null check (char_length(review_id) <= 300),
  reviewer_name text check (char_length(reviewer_name) <= 200),
  star_rating int check (star_rating between 1 and 5),
  comment text check (char_length(comment) <= 5000),
  reply text check (char_length(reply) <= 4096),
  replied_at timestamptz,
  review_time timestamptz,
  synced_at timestamptz not null default now(),
  unique (tenant_id, review_id)
);
create index gbp_reviews_tenant_idx on public.gbp_reviews (tenant_id, review_time desc);

-- 6. Planner: Google Business local posts are an auto-publish channel.
alter table public.social_posts drop constraint if exists social_posts_platforms_check;
alter table public.social_posts add constraint social_posts_platforms_check
  check (platforms <@ array['facebook', 'instagram', 'pinterest', 'google', 'whatsapp', 'x', 'linkedin', 'threads', 'youtube']::text[]);

create trigger trg_social_conversations_updated_at before update on public.social_conversations for each row execute function app.set_updated_at();
create trigger trg_brand_profiles_updated_at before update on public.brand_profiles for each row execute function app.set_updated_at();

alter table public.social_conversations enable row level security;
alter table public.social_messages enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.ai_generations enable row level security;
alter table public.gbp_reviews enable row level security;
create policy social_conversations_read on public.social_conversations for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
create policy social_conversations_write on public.social_conversations for update to authenticated
  using (app.has_tenant_permission(tenant_id, 'marketing.write')) with check (app.has_tenant_permission(tenant_id, 'marketing.write'));
create policy social_messages_read on public.social_messages for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
create policy brand_profiles_read on public.brand_profiles for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
create policy brand_profiles_write on public.brand_profiles for all to authenticated
  using (app.has_tenant_permission(tenant_id, 'marketing.write')) with check (app.has_tenant_permission(tenant_id, 'marketing.write'));
create policy ai_generations_read on public.ai_generations for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
create policy gbp_reviews_read on public.gbp_reviews for select to authenticated using (app.has_tenant_permission(tenant_id, 'marketing.read'));
grant select, update on public.social_conversations to authenticated;
grant select on public.social_messages, public.ai_generations, public.gbp_reviews to authenticated;
grant select, insert, update, delete on public.brand_profiles to authenticated;
grant all on public.social_conversations, public.social_messages, public.brand_profiles, public.ai_generations, public.gbp_reviews to service_role;
-- Inserts into social_messages / ai_generations / gbp_reviews are server-side (secret-key client)
-- after a permission check or a verified webhook signature.
