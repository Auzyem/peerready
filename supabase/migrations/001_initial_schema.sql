create extension if not exists "uuid-ossp";

create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  institution text,
  discipline text,
  career_stage text check (career_stage in ('phd_student','postdoc','junior_faculty','senior_faculty','independent')),
  native_language text default 'english',
  created_at timestamptz default now()
);

create table public.manuscripts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  abstract text,
  field text,
  subfield text,
  doc_type text check (doc_type in ('journal_article','thesis_chapter','conference_paper','grant_proposal','systematic_review')),
  submission_target text,
  word_count integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.drafts (
  id uuid default uuid_generate_v4() primary key,
  manuscript_id uuid references public.manuscripts(id) on delete cascade not null,
  version_number integer not null default 1,
  storage_path text not null,
  file_name text not null,
  file_type text check (file_type in ('pdf','docx')),
  parsed_text text,
  parsed_sections jsonb,
  created_at timestamptz default now(),
  unique(manuscript_id, version_number)
);

create table public.review_sessions (
  id uuid default uuid_generate_v4() primary key,
  draft_id uuid references public.drafts(id) on delete cascade not null,
  status text check (status in ('queued','routing','reviewing','adversarial','matching','comparing','complete','failed')) default 'queued',
  reviewer_persona text,
  mode text check (mode in ('standard','adversarial','journal_focused')) default 'standard',
  overall_score integer,
  verdict text check (verdict in ('accept','minor_revision','major_revision','reject')),
  strength_summary text,
  weakness_summary text,
  score_delta jsonb,
  error_message text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table public.scores (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.review_sessions(id) on delete cascade not null,
  dimension text check (dimension in (
    'originality','significance','methodology','evidence_quality',
    'literature_engagement','internal_logic','presentation_clarity','ethical_compliance'
  )) not null,
  score integer check (score between 1 and 10) not null,
  max_score integer default 10,
  rationale text,
  improvements jsonb,
  created_at timestamptz default now()
);

create table public.annotations (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.review_sessions(id) on delete cascade not null,
  section text,
  char_start integer,
  char_end integer,
  severity text check (severity in ('critical','major','minor')) not null,
  comment text not null,
  suggestion text,
  resolved boolean default false,
  created_at timestamptz default now()
);

create table public.journal_matches (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.review_sessions(id) on delete cascade not null,
  rank integer not null,
  journal_name text not null,
  publisher text,
  fit_score float check (fit_score between 0 and 1),
  acceptance_band text check (acceptance_band in ('high','medium','low')),
  impact_factor_range text,
  avg_decision_days integer,
  key_change_required text,
  open_access_options text,
  apc_cost text,
  rationale text,
  created_at timestamptz default now()
);

create table public.adversarial_critiques (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references public.review_sessions(id) on delete cascade not null,
  critique_number integer not null,
  severity text check (severity in ('critical','major','minor')) not null,
  title text not null,
  quoted_passage text,
  objection text not null,
  required_fix text not null,
  section_reference text,
  resolved boolean default false,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.manuscripts enable row level security;
alter table public.drafts enable row level security;
alter table public.review_sessions enable row level security;
alter table public.scores enable row level security;
alter table public.annotations enable row level security;
alter table public.journal_matches enable row level security;
alter table public.adversarial_critiques enable row level security;

create policy "users_own_profile" on public.profiles for all using (auth.uid() = id);
create policy "users_own_manuscripts" on public.manuscripts for all using (auth.uid() = user_id);
create policy "users_own_drafts" on public.drafts for all using (
  auth.uid() = (select user_id from public.manuscripts where id = manuscript_id)
);
create policy "users_own_sessions" on public.review_sessions for all using (
  auth.uid() = (select m.user_id from public.manuscripts m
    join public.drafts d on d.manuscript_id = m.id
    where d.id = draft_id)
);
create policy "users_own_scores" on public.scores for all using (
  auth.uid() = (select m.user_id from public.manuscripts m
    join public.drafts d on d.manuscript_id = m.id
    join public.review_sessions rs on rs.draft_id = d.id
    where rs.id = session_id)
);
create policy "users_own_annotations" on public.annotations for all using (
  auth.uid() = (select m.user_id from public.manuscripts m
    join public.drafts d on d.manuscript_id = m.id
    join public.review_sessions rs on rs.draft_id = d.id
    where rs.id = session_id)
);
create policy "users_own_journal_matches" on public.journal_matches for all using (
  auth.uid() = (select m.user_id from public.manuscripts m
    join public.drafts d on d.manuscript_id = m.id
    join public.review_sessions rs on rs.draft_id = d.id
    where rs.id = session_id)
);
create policy "users_own_adversarial" on public.adversarial_critiques for all using (
  auth.uid() = (select m.user_id from public.manuscripts m
    join public.drafts d on d.manuscript_id = m.id
    join public.review_sessions rs on rs.draft_id = d.id
    where rs.id = session_id)
);

insert into storage.buckets (id, name, public) values ('manuscripts', 'manuscripts', false);
create policy "users_own_manuscript_files" on storage.objects for all
  using (auth.uid()::text = (storage.foldername(name))[1]);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
