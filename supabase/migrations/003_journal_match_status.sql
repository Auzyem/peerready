-- On-demand journal matching lifecycle (mirrors 002_adversarial_status).
-- The journal_matches table already exists (001); this tracks the pass state
-- so the Journals tab survives reloads, like the Adversarial tab does.
alter table public.review_sessions
  add column journal_match_status text
    check (journal_match_status in ('not_started','running','complete','failed'))
    default 'not_started';
