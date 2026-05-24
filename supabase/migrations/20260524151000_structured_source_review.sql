alter table public.dl_cases
  add column if not exists source_event_id uuid,
  add column if not exists post_title text,
  add column if not exists post_text text,
  add column if not exists comments jsonb not null default '[]'::jsonb,
  add column if not exists relevance text not null default 'Needs review',
  add column if not exists classification_reason text;

alter table public.dl_source_events
  add column if not exists post_title text,
  add column if not exists post_text text,
  add column if not exists comments jsonb not null default '[]'::jsonb,
  add column if not exists relevance text not null default 'Needs review',
  add column if not exists classification_reason text,
  add column if not exists review_status text not null default 'New',
  add column if not exists review_note text,
  add column if not exists acknowledged_by uuid references public.dl_profiles(id),
  add column if not exists acknowledged_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dl_cases_relevance_check'
  ) then
    alter table public.dl_cases
      add constraint dl_cases_relevance_check
      check (relevance in ('Actionable', 'Needs review', 'Information', 'Not relevant'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dl_source_events_relevance_check'
  ) then
    alter table public.dl_source_events
      add constraint dl_source_events_relevance_check
      check (relevance in ('Actionable', 'Needs review', 'Information', 'Not relevant'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dl_source_events_review_status_check'
  ) then
    alter table public.dl_source_events
      add constraint dl_source_events_review_status_check
      check (review_status in ('New', 'Acknowledged', 'Escalated', 'Ignored'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dl_cases_source_event_id_fkey'
  ) then
    alter table public.dl_cases
      add constraint dl_cases_source_event_id_fkey
      foreign key (source_event_id) references public.dl_source_events(id);
  end if;
end;
$$;

create index if not exists dl_cases_source_event_idx
  on public.dl_cases(source_event_id);

create index if not exists dl_source_events_review_status_idx
  on public.dl_source_events(review_status, created_at desc);

insert into public.dl_monitored_keywords (keyword, category, severity)
values
  ('security', 'Security', 'Medium'),
  ('fight', 'Security', 'High'),
  ('assault', 'Security', 'High'),
  ('harassment', 'Security', 'High'),
  ('threatening', 'Security', 'High'),
  ('aggressive', 'Security', 'Medium'),
  ('stolen', 'Security', 'Medium'),
  ('theft', 'Security', 'Medium')
on conflict do nothing;

update public.dl_source_events
set
  post_text = coalesce(post_text, redacted_text),
  post_title = coalesce(post_title, left(redacted_text, 96)),
  relevance = coalesce(relevance, 'Needs review'),
  classification_reason = coalesce(classification_reason, 'Imported before structured source review was enabled.'),
  review_status = case
    when converted_case_id is not null then 'Escalated'
    when ignored then 'Ignored'
    else 'New'
  end;

update public.dl_cases
set
  post_text = coalesce(post_text, redacted_text),
  post_title = coalesce(post_title, title),
  comments = coalesce(comments, '[]'::jsonb),
  relevance = coalesce(relevance, 'Actionable'),
  classification_reason = coalesce(classification_reason, 'Created before structured source review was enabled.');
