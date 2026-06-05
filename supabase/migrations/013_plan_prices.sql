-- Plan → Stripe price mapping, moved out of the STRIPE_PRICE_* env vars and into
-- the database so the admin console can change a charged price at runtime (no env
-- edit, no redeploy). One row per Stripe price EVER created — current and archived.
--
-- Why keep archived rows: Stripe prices are immutable, so changing an amount means
-- creating a NEW price and archiving the old. Grandfathered subscribers keep their
-- old price; when their subscription later changes, Stripe's webhook carries the OLD
-- price ID. The reverse lookup must still resolve it to the correct plan, or the
-- webhook would fall through to 'free' and silently downgrade a paying customer.
create table if not exists public.plan_prices (
  id              uuid primary key default uuid_generate_v4(),
  plan_id         text not null references public.plans(id) on delete cascade,
  interval        text not null check (interval in ('monthly','annual')),
  stripe_price_id text not null unique,
  unit_amount     integer not null,            -- cents, as baked into the Stripe price
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Exactly one active price per (plan, interval). The partial unique index is why
-- the active-price swap below must run as one transaction (deactivate then insert).
create unique index if not exists plan_prices_one_active
  on public.plan_prices (plan_id, interval) where active;

-- Fast reverse lookup for the webhook.
create index if not exists plan_prices_stripe_price_id_idx
  on public.plan_prices (stripe_price_id);

-- Atomic active-price swap: archive the current active row, insert the new active
-- row. security definer so the service-role caller runs it as one unit. The partial
-- unique index guarantees there is never more than one active row to deactivate.
create or replace function public.swap_plan_price(
  p_plan_id text,
  p_interval text,
  p_stripe_price_id text,
  p_unit_amount integer
) returns void language plpgsql security definer as $$
begin
  update public.plan_prices
     set active = false
   where plan_id = p_plan_id and interval = p_interval and active;

  insert into public.plan_prices (plan_id, interval, stripe_price_id, unit_amount, active)
  values (p_plan_id, p_interval, p_stripe_price_id, p_unit_amount, true);
end;
$$;

-- RLS on. No anon/authenticated policy is added: the app reads and writes
-- plan_prices exclusively through the service-role admin client (which bypasses
-- RLS), exactly like billing_events. Locked-by-default is the safe choice here.
alter table public.plan_prices enable row level security;
