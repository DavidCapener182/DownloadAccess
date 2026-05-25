alter table public.dl_cases
  add column if not exists media_urls text[] not null default '{}';

alter table public.dl_source_events
  add column if not exists media_urls text[] not null default '{}';
