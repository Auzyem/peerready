-- Plans
create table if not exists public.plans (
  id text primary key,
  name text not null,
  price_monthly numeric,
  price_annual numeric,
  max_manuscripts integer,
  max_reviews_per_month integer,
  adversarial_access boolean default false,
  journal_matching boolean default false,
  pdf_reports boolean default false,
  team_members integer default 1,
  api_access boolean default false,
  created_at timestamptz default now()
);

insert into public.plans
  (id, name, price_monthly, price_annual, max_manuscripts, max_reviews_per_month, adversarial_access, journal_matching, pdf_reports) values
  ('free',    'Free',    0,  0,   3,    2,    false, false, false),
  ('starter', 'Starter', 12, 96,  20,   10,   false, true,  true),
  ('pro',     'Pro',     29, 228, 100,  30,   true,  true,  true),
  ('team',    'Team',    79, 636, null, null, true,  true,  true)
on conflict (id) do nothing;

-- Subscriptions
create table if not exists public.subscriptions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade unique,
  plan_id text references public.plans(id) default 'free',
  status text check (status in ('active','trialing','past_due','canceled','free')) default 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.subscriptions enable row level security;
create policy "users_own_subscription" on public.subscriptions for all using (auth.uid() = user_id);

-- Auto-create a free subscription whenever a profile is created
create or replace function public.handle_new_subscription()
returns trigger as $$
begin
  insert into public.subscriptions (user_id, plan_id, status)
  values (new.id, 'free', 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute procedure public.handle_new_subscription();

-- Backfill: give every existing profile a free subscription (trigger only fires for new rows)
insert into public.subscriptions (user_id, plan_id, status)
select id, 'free', 'free' from public.profiles
on conflict (user_id) do nothing;

-- Admin roles (managed via service role; no self-referential RLS to avoid recursion)
create table if not exists public.user_roles (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  role text check (role in ('super_admin','admin','reviewer','author')) default 'author',
  created_at timestamptz default now(),
  unique(user_id, role)
);

alter table public.user_roles enable row level security;
create policy "users_read_own_role" on public.user_roles for select using (auth.uid() = user_id);
