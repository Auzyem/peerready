-- Admin-controlled discounts and explicit USD price points per plan.
-- Note: 006_saas_scaffold already defines plans.price_monthly / price_annual
-- (annual = yearly total). These new *_usd columns store the values the billing
-- UI renders directly: monthly rate and the per-month rate when billed annually.

alter table public.plans
  add column if not exists annual_discount_pct integer default 0
    check (annual_discount_pct between 0 and 100);

alter table public.plans
  add column if not exists price_monthly_usd numeric(8,2),
  add column if not exists price_annual_monthly_usd numeric(8,2);

-- Seed from the previously hardcoded billing values.
update public.plans set price_monthly_usd = 0,     price_annual_monthly_usd = 0,  annual_discount_pct = 0  where id = 'free';
update public.plans set price_monthly_usd = 12.00, price_annual_monthly_usd = 8.00,  annual_discount_pct = 33 where id = 'starter';
update public.plans set price_monthly_usd = 29.00, price_annual_monthly_usd = 19.00, annual_discount_pct = 34 where id = 'pro';
update public.plans set price_monthly_usd = 79.00, price_annual_monthly_usd = 59.00, annual_discount_pct = 25 where id = 'team';
