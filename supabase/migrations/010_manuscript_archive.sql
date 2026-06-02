-- Soft-archive support for manuscripts (list view filter + batch actions).
alter table public.manuscripts
  add column if not exists archived boolean default false,
  add column if not exists archived_at timestamptz;

create index if not exists idx_manuscripts_user_archived
  on public.manuscripts(user_id, archived);
