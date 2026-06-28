-- NEMO Workspace: workflows, audit log, job queue, deployment plans
-- Apply via Supabase SQL editor, MCP execute_sql, or supabase db push

create extension if not exists "pgcrypto";

-- Deployment tier definitions (demo / paywall / production)
create table if not exists public.nemo_plans (
  tier text primary key check (tier in ('demo', 'paywall', 'production')),
  label text not null,
  tagline text not null,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.nemo_plans (tier, label, tagline, config) values
  (
    'demo',
    'Live Demo',
    'Real URL fetch · sample summaries · no account required',
    '{"liveAi":false,"strictAi":false,"allowDemoOutput":true}'::jsonb
  ),
  (
    'paywall',
    'Pro',
    'Live AI agents · requires AI Gateway credits',
    '{"liveAi":true,"strictAi":false,"allowDemoOutput":false}'::jsonb
  ),
  (
    'production',
    'Production',
    'Full live AI · strict mode · no silent fallbacks',
    '{"liveAi":true,"strictAi":true,"allowDemoOutput":false}'::jsonb
  )
on conflict (tier) do update set
  label = excluded.label,
  tagline = excluded.tagline,
  config = excluded.config,
  updated_at = now();

create table if not exists public.nemo_workflows (
  id uuid primary key,
  template_id text not null,
  title text not null,
  user_prompt text not null,
  status text not null,
  current_stage_index int not null default 0,
  record jsonb not null,
  source_context text,
  memory_context text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nemo_workflows_status_updated
  on public.nemo_workflows (status, updated_at desc);

create table if not exists public.nemo_audit_log (
  id bigserial primary key,
  workflow_id uuid not null references public.nemo_workflows(id) on delete cascade,
  at timestamptz not null,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists nemo_audit_log_workflow_id
  on public.nemo_audit_log (workflow_id, at desc);

create table if not exists public.nemo_workflow_jobs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.nemo_workflows(id) on delete cascade,
  job_type text not null default 'run_stage' check (job_type in ('run_stage')),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  attempts int not null default 0,
  max_attempts int not null default 3,
  scheduled_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nemo_workflow_jobs_pending
  on public.nemo_workflow_jobs (scheduled_at asc)
  where status = 'pending';

-- Claim one pending job (service role only)
create or replace function public.nemo_claim_workflow_job(p_worker_id text)
returns public.nemo_workflow_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.nemo_workflow_jobs;
begin
  select * into v_job
  from public.nemo_workflow_jobs
  where status = 'pending'
    and scheduled_at <= now()
  order by scheduled_at asc
  limit 1
  for update skip locked;

  if v_job.id is null then
    return null;
  end if;

  update public.nemo_workflow_jobs
  set
    status = 'running',
    locked_at = now(),
    locked_by = p_worker_id,
    attempts = attempts + 1,
    updated_at = now()
  where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.nemo_claim_workflow_job(text) from public;
grant execute on function public.nemo_claim_workflow_job(text) to service_role;

alter table public.nemo_plans enable row level security;
alter table public.nemo_workflows enable row level security;
alter table public.nemo_audit_log enable row level security;
alter table public.nemo_workflow_jobs enable row level security;

-- Server uses service_role (bypasses RLS). No anon/authenticated policies.
