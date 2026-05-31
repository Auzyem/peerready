-- On-demand reporting-guideline checklist (mirrors 003_journal_match_status).
alter table public.review_sessions
  add column reporting_check_status text
    check (reporting_check_status in ('not_started','running','complete','failed'))
    default 'not_started',
  add column reporting_guideline_id text,
  add column reporting_summary text;

create table public.reporting_checklist_items (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.review_sessions(id) on delete cascade not null,
  guideline_id text not null,
  item_code text not null,
  section text,
  requirement text,
  status text check (status in ('present','partial','missing','not_applicable')) not null,
  evidence text,
  fix text,
  created_at timestamptz default now()
);

alter table public.reporting_checklist_items enable row level security;

create policy "users_own_reporting_items" on public.reporting_checklist_items for all using (
  auth.uid() = (select m.user_id from public.manuscripts m
    join public.drafts d on d.manuscript_id = m.id
    join public.review_sessions rs on rs.draft_id = d.id
    where rs.id = session_id)
);
