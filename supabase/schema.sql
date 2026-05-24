-- KSS Accessibility Live Monitor schema
-- Run in Supabase SQL editor or through your migration pipeline.

create extension if not exists pgcrypto;
create table if not exists public.dl_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (
    role in (
      'Admin',
      'Duty Manager',
      'Control Room Operator',
      'Field Supervisor',
      'Monitor',
      'Read-only Client Viewer'
    )
  ),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.dl_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null,
  platform text not null,
  url text,
  active boolean not null default true,
  approved_for_monitoring boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.dl_source_api_tokens (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.dl_sources(id) on delete cascade,
  label text not null,
  token_hash text not null unique,
  active boolean not null default true,
  created_by uuid references public.dl_profiles(id),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.dl_monitored_keywords (
  id uuid primary key default gen_random_uuid(),
  keyword text not null,
  category text,
  severity text not null check (severity in ('Critical', 'High', 'Medium', 'Low')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (keyword)
);

create table if not exists public.dl_site_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.dl_cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_id uuid references public.dl_sources(id),
  source_platform text,
  source_type text,
  source_url text,
  original_text text,
  redacted_text text not null,
  text_hash text not null,
  category text not null,
  severity text not null check (severity in ('Critical', 'High', 'Medium', 'Low')),
  status text not null default 'New' check (
    status in (
      'New',
      'Reviewing',
      'Assigned',
      'In Progress',
      'Escalated',
      'Resolved',
      'Closed',
      'Ignored / Not Relevant'
    )
  ),
  location_id uuid references public.dl_site_locations(id),
  assigned_to uuid references public.dl_profiles(id),
  personal_data_present boolean not null default false,
  special_category_risk boolean not null default false,
  safeguarding_or_medical_flag boolean not null default false,
  duplicate_of uuid references public.dl_cases(id),
  created_by uuid references public.dl_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.dl_case_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.dl_cases(id) on delete cascade,
  action_type text not null,
  note text not null,
  created_by uuid references public.dl_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.dl_case_status_history (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.dl_cases(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references public.dl_profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.dl_source_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.dl_sources(id),
  raw_text text not null,
  redacted_text text not null,
  text_hash text not null,
  source_url text,
  matched_keywords text[] not null default '{}',
  predicted_category text,
  predicted_severity text not null check (predicted_severity in ('Critical', 'High', 'Medium', 'Low')),
  converted_case_id uuid references public.dl_cases(id),
  ignored boolean not null default false,
  ignored_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.dl_public_reports (
  id uuid primary key default gen_random_uuid(),
  issue_type text not null,
  location_id uuid references public.dl_site_locations(id),
  report_text text not null,
  assistance_required_now boolean not null default false,
  callback_required boolean not null default false,
  contact_name text,
  contact_phone text,
  consent_given boolean not null default false,
  converted_case_id uuid references public.dl_cases(id),
  created_at timestamptz not null default now()
);

create table if not exists public.dl_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.dl_profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dl_alerts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.dl_cases(id) on delete cascade,
  alert_type text not null,
  severity text not null check (severity in ('Critical', 'High', 'Medium', 'Low')),
  message text not null,
  acknowledged boolean not null default false,
  acknowledged_by uuid references public.dl_profiles(id),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.dl_retention_jobs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  scheduled_delete_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.dl_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_cases_updated_at on public.dl_cases;
create trigger set_cases_updated_at
before update on public.dl_cases
for each row execute function public.dl_set_updated_at();

create index if not exists dl_cases_status_idx on public.dl_cases(status);
create index if not exists dl_cases_severity_idx on public.dl_cases(severity);
create index if not exists dl_cases_location_idx on public.dl_cases(location_id);
create index if not exists dl_cases_text_hash_idx on public.dl_cases(text_hash);
create index if not exists dl_cases_created_at_idx on public.dl_cases(created_at desc);
create index if not exists dl_alerts_ack_idx on public.dl_alerts(acknowledged, severity);
create index if not exists dl_source_events_hash_idx on public.dl_source_events(text_hash);
create index if not exists dl_source_events_created_idx on public.dl_source_events(created_at desc);
create index if not exists dl_public_reports_created_idx on public.dl_public_reports(created_at desc);

alter table public.dl_profiles enable row level security;
alter table public.dl_sources enable row level security;
alter table public.dl_source_api_tokens enable row level security;
alter table public.dl_monitored_keywords enable row level security;
alter table public.dl_site_locations enable row level security;
alter table public.dl_cases enable row level security;
alter table public.dl_case_actions enable row level security;
alter table public.dl_case_status_history enable row level security;
alter table public.dl_source_events enable row level security;
alter table public.dl_public_reports enable row level security;
alter table public.dl_audit_log enable row level security;
alter table public.dl_alerts enable row level security;
alter table public.dl_retention_jobs enable row level security;

-- The Next.js API accesses these prefixed tables server-side with the service
-- role key. Public browser code must not receive the service role key.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;

drop policy if exists "public can read approved sources" on public.dl_sources;

create policy "public can read approved sources"
on public.dl_sources for select
to anon, authenticated
using (active = true and approved_for_monitoring = true);

drop policy if exists "public can read active keywords" on public.dl_monitored_keywords;

create policy "public can read active keywords"
on public.dl_monitored_keywords for select
to anon, authenticated
using (active = true);

drop policy if exists "public can read active locations" on public.dl_site_locations;

create policy "public can read active locations"
on public.dl_site_locations for select
to anon, authenticated
using (active = true);

drop policy if exists "anon can submit consented public reports" on public.dl_public_reports;

create policy "anon can submit consented public reports"
on public.dl_public_reports for insert
to anon
with check (consent_given = true);

drop policy if exists "authenticated can read active profiles" on public.dl_profiles;

create policy "authenticated can read active profiles"
on public.dl_profiles for select
to authenticated
using (active = true);

drop policy if exists "authenticated can read cases" on public.dl_cases;

create policy "authenticated can read cases"
on public.dl_cases for select
to authenticated
using (true);

drop policy if exists "authenticated can update cases" on public.dl_cases;

create policy "authenticated can update cases"
on public.dl_cases for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated can insert case actions" on public.dl_case_actions;

create policy "authenticated can insert case actions"
on public.dl_case_actions for insert
to authenticated
with check (true);

drop policy if exists "authenticated can read case actions" on public.dl_case_actions;

create policy "authenticated can read case actions"
on public.dl_case_actions for select
to authenticated
using (true);

drop policy if exists "authenticated can read alerts" on public.dl_alerts;

create policy "authenticated can read alerts"
on public.dl_alerts for select
to authenticated
using (true);

drop policy if exists "authenticated can update alerts" on public.dl_alerts;

create policy "authenticated can update alerts"
on public.dl_alerts for update
to authenticated
using (true)
with check (true);

-- source_api_tokens intentionally has no anon/authenticated policies.
-- The Next.js API uses SUPABASE_SERVICE_ROLE_KEY server-side to validate tokens.
