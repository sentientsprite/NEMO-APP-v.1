-- Outbound CRM — leads + activity log for Hunter webhook + rep UI
-- Run via Supabase CLI: `supabase db push` from apps/outbound-crm, or paste in SQL editor.

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- enums
-- -----------------------------------------------------------------------------

create type outbound_lead_status as enum (
  'new',
  'contacted',
  'no_answer',
  'follow_up',
  'qualified',
  'meeting_booked',
  'closed_won',
  'closed_lost'
);

create type outbound_activity_type as enum (
  'call_attempt',
  'note',
  'status_change'
);

-- -----------------------------------------------------------------------------
-- leads
-- -----------------------------------------------------------------------------

create table public.outbound_leads (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  name text not null,
  company text,
  phone text not null,
  phone_normalized text not null,
  email text,
  source text,
  status outbound_lead_status not null default 'new',
  priority int,
  assigned_to uuid references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outbound_leads_external_id_unique unique (external_id)
);

-- Dedupe when Hunter does not send external_id: same person (phone + name)
create unique index outbound_leads_dedupe_phone_name
  on public.outbound_leads (phone_normalized, lower(trim(name)))
  where external_id is null;

create index outbound_leads_status_created_idx
  on public.outbound_leads (status, created_at desc);

create index outbound_leads_source_idx
  on public.outbound_leads (source);

-- -----------------------------------------------------------------------------
-- activities (append-only log)
-- -----------------------------------------------------------------------------

create table public.outbound_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.outbound_leads (id) on delete cascade,
  type outbound_activity_type not null,
  note text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index outbound_activities_lead_created_idx
  on public.outbound_activities (lead_id, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------

create or replace function public.outbound_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger outbound_leads_set_updated_at
  before update on public.outbound_leads
  for each row execute function public.outbound_set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: any authenticated user = the rep (single-tenant)
-- Service role (webhook) bypasses RLS.
-- -----------------------------------------------------------------------------

alter table public.outbound_leads enable row level security;
alter table public.outbound_activities enable row level security;

create policy "outbound_leads_authenticated_all"
  on public.outbound_leads
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "outbound_activities_authenticated_all"
  on public.outbound_activities
  for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Optional: allow rep to read own user row for assigned_to display
-- (usually enabled by default in Supabase for auth.users — not exposed via API)

comment on table public.outbound_leads is 'Hunter webhook + rep CRM leads; single-tenant, RLS for authenticated rep only.';
comment on table public.outbound_activities is 'Append-only activity log; call_attempt, note, status_change.';
