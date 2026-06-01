alter table public.subscriptions
  add column if not exists stripe_price_id text,
  add column if not exists billing_interval text check (billing_interval in ('monthly','annual')),
  add column if not exists cancel_at_period_end boolean default false,
  add column if not exists trial_end timestamptz;

create table if not exists public.billing_events (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  stripe_event_id text unique not null,
  event_type text not null,
  payload jsonb,
  processed_at timestamptz default now()
);

alter table public.billing_events enable row level security;
-- Reading user_roles from a policy on billing_events is fine (no recursion).
drop policy if exists "admins_read_billing_events" on public.billing_events;
create policy "admins_read_billing_events" on public.billing_events for select using (
  exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('super_admin','admin'))
);
