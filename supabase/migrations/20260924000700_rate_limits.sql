-- =============================================================================
-- 0700 RATE LIMITING (fixed window, Postgres-backed; ADR-025)
-- Edge rate limits (Cloudflare) handle volumetric abuse; this protects specific
-- actions (login, OTP, checkout, review/contact submissions) per key.
-- =============================================================================
create table public.rate_limit_counters (
  key text not null check (char_length(key) <= 200),
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limit_counters enable row level security; -- no policies: server only
create index rate_limit_counters_window_idx on public.rate_limit_counters (window_start);

create or replace function public.svc_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limit_counters as c (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = c.hits + 1
  returning c.hits into v_hits;
  -- opportunistic cleanup of old windows (cheap, indexed)
  if random() < 0.01 then delete from public.rate_limit_counters where window_start < now() - interval '1 day'; end if;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.svc_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.svc_rate_limit(text, int, int) to service_role;
grant all on public.rate_limit_counters to service_role;
