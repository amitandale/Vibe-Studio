-- Migration: add encrypted provider tokens and pull request tables
-- Ensures onboarding can persist token metadata and PR audit trails per project

begin;

create table if not exists project_provider_tokens (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  provider_id text not null,
  label text,
  encrypted_token jsonb not null,
  status text not null default 'valid',
  scopes text[] default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_provider_tokens_project on project_provider_tokens(project_id);
create index if not exists idx_project_provider_tokens_provider on project_provider_tokens(provider_id);

create table if not exists project_pull_requests (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  title text not null,
  status text not null default 'draft',
  description text,
  branch text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_prs_project on project_pull_requests(project_id);
create index if not exists idx_project_prs_status on project_pull_requests(status);

create table if not exists project_pr_messages (
  id uuid primary key default gen_random_uuid(),
  pull_request_id uuid not null references project_pull_requests(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_pr_messages_pr on project_pr_messages(pull_request_id);

commit;
