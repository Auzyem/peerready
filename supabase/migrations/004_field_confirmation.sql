-- #6 low-confidence "confirm field" step.
-- Stores the discipline router's confidence and adds an 'awaiting_confirmation'
-- status so the pipeline can pause for the user before the deep review.
alter table public.review_sessions
  add column routing_confidence float;

alter table public.review_sessions
  drop constraint if exists review_sessions_status_check;

alter table public.review_sessions
  add constraint review_sessions_status_check
  check (status in (
    'queued','routing','awaiting_confirmation','reviewing',
    'adversarial','matching','comparing','complete','failed'
  ));
