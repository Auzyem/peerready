-- API keys for external service authentication (OJS, Zapier, custom scripts).
-- Keys are plan-gated: the existing plans.api_access boolean is the on/off gate,
-- plans.max_api_keys caps the count, plans.allowed_scopes caps the scopes.
-- Admin reads/writes go through the service-role client after an API-level
-- permission check (same approach as 011) — so we deliberately add only the
-- per-user RLS policy here, not a cross-user admin policy.

create table if not exists public.api_keys (
  id           uuid default uuid_generate_v4() primary key,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  name         text not null,
  key_hash     text not null,          -- bcrypt hash of the full key, never the plaintext
  key_prefix   text not null,          -- 'sl_live_' or 'sl_test_'
  key_suffix   text not null,          -- last 4 chars, for masked display
  scopes       text[] not null default '{}',
  environment  text check (environment in ('live','test')) default 'live',
  expires_at   timestamptz,            -- null = never expires
  last_used_at timestamptz,
  last_used_ip inet,
  revoked      boolean default false,
  revoked_at   timestamptz,
  created_at   timestamptz default now()
);

-- The auth path filters by prefix+suffix among non-revoked keys, then bcrypt-compares.
create index if not exists idx_api_keys_lookup
  on public.api_keys(key_prefix, key_suffix, revoked);
create index if not exists idx_api_keys_user_active
  on public.api_keys(user_id, revoked);

alter table public.api_keys enable row level security;
create policy "users_own_api_keys" on public.api_keys for all
  using (auth.uid() = user_id);

-- Plan-level API key configuration. api_access already exists (006) and is the
-- on/off gate; add the count cap and scope allowlist.
alter table public.plans
  add column if not exists max_api_keys   integer default 0,
  add column if not exists allowed_scopes text[] default '{}';

update public.plans set
  api_access     = false,
  max_api_keys   = 0,
  allowed_scopes = '{}'
where id = 'free';

update public.plans set
  api_access     = true,
  max_api_keys   = 2,
  allowed_scopes = '{review:read,manuscript:read}'
where id = 'starter';

update public.plans set
  api_access     = true,
  max_api_keys   = 10,
  allowed_scopes = '{review:read,review:write,manuscript:read,manuscript:write,webhook:manage,pdf:generate}'
where id = 'pro';

update public.plans set
  api_access     = true,
  max_api_keys   = -1,   -- -1 = unlimited
  allowed_scopes = '{review:read,review:write,manuscript:read,manuscript:write,webhook:manage,pdf:generate,admin:read,user:manage}'
where id = 'team';

-- API key usage audit log (table created now; population is a later enhancement).
create table if not exists public.api_key_usage (
  id          uuid default uuid_generate_v4() primary key,
  key_id      uuid references public.api_keys(id) on delete cascade not null,
  endpoint    text not null,
  method      text not null,
  status_code integer,
  ip_address  inet,
  user_agent  text,
  called_at   timestamptz default now()
);

alter table public.api_key_usage enable row level security;
create policy "users_read_own_key_usage" on public.api_key_usage for select using (
  auth.uid() = (select user_id from public.api_keys where id = key_id)
);

-- Webhooks (forward-compat stub for the webhook:manage scope; no delivery yet).
create table if not exists public.webhooks (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  name        text not null,
  url         text not null,
  events      text[] not null default '{}',
  secret      text not null,    -- HMAC signing secret, shown once
  active      boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.webhooks enable row level security;
create policy "users_own_webhooks" on public.webhooks for all
  using (auth.uid() = user_id);

-- Permissions for the admin API-keys panel (layered on 011's catalog).
insert into public.permissions (id, label, description, category) values
  ('api_keys.view',   'View API keys',   'View API keys belonging to any user', 'system'),
  ('api_keys.revoke', 'Revoke API keys', 'Revoke any user''s API key',          'system')
on conflict (id) do nothing;

insert into public.role_permissions (role, permission_id) values
  ('super_admin','api_keys.view'),('super_admin','api_keys.revoke'),
  ('admin','api_keys.view'),('admin','api_keys.revoke')
on conflict do nothing;
