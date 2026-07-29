-- ATLAS Supabase Schema — run in Supabase SQL editor

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz default now(),
  source text,
  type text,
  raw_payload jsonb,
  severity text,
  status text default 'new'
);

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  title text,
  severity text,
  status text default 'open',
  data_source text default 'real_capture'
);

create table if not exists agent_actions (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz default now(),
  incident_id uuid references incidents(id),
  agent_name text,
  action text,
  params jsonb,
  approved_by text
);

create table if not exists decision_log (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz default now(),
  incident_id uuid references incidents(id),
  reasoning_text text,
  plan_json jsonb
);

create table if not exists voice_history (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz default now(),
  transcribed text,
  response_text text
);

-- ATLAS Memory — stores learned incident patterns for future context
create table if not exists atlas_memory (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  fingerprint text,
  event_type text,
  severity text,
  source_ip text,
  agent_results_summary jsonb,
  final_response text,
  incident_id uuid references incidents(id)
);

create index if not exists idx_atlas_memory_event_type on atlas_memory(event_type);
create index if not exists idx_atlas_memory_created_at on atlas_memory(created_at desc);
create index if not exists idx_events_ts on events(ts desc);
create index if not exists idx_incidents_status on incidents(status);
create index if not exists idx_agent_actions_incident on agent_actions(incident_id);
