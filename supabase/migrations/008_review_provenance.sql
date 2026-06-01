-- Provenance for the progress delta: which prior session this review was compared against.
alter table public.review_sessions
  add column if not exists compared_to_session_id uuid references public.review_sessions(id) on delete set null;
