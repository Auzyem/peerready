-- Plans are public pricing reference data. 006_saas_scaffold created the table
-- but never added an RLS read policy, so the anon/authenticated Data API roles
-- (used by the public /api/billing/plans route that backs both the landing-page
-- pricing section and the billing page) receive an empty result and no prices
-- render. Add a permissive public read policy.
--
-- Writes stay restricted: the admin plans API uses the service-role client,
-- which bypasses RLS, and anon/authenticated have no write policy here.
alter table public.plans enable row level security;

drop policy if exists "plans_public_read" on public.plans;
create policy "plans_public_read" on public.plans for select using (true);

grant select on public.plans to anon, authenticated;
