alter table public.review_sessions
  add column adversarial_status text
    check (adversarial_status in ('not_started','running','complete','failed'))
    default 'not_started';

alter table public.review_sessions
  add column adversarial_summary text;
