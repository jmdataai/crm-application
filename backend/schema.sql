-- ============================================================
-- Nexus CRM + ATS — Supabase Schema
-- Paste into Supabase Dashboard → SQL Editor → Run
-- ============================================================

create extension if not exists "uuid-ossp";

-- Safe re-run: drop in reverse FK order
drop table if exists interviews              cascade;
drop table if exists candidate_status_history cascade;
drop table if exists lead_status_history     cascade;
drop table if exists activities              cascade;
drop table if exists reminders               cascade;
drop table if exists tasks                   cascade;
drop table if exists imports                 cascade;
drop table if exists candidates              cascade;
drop table if exists jobs                    cascade;
drop table if exists leads                   cascade;
drop table if exists users                   cascade;

-- ── 1. USERS ─────────────────────────────────────────────────
create table users (
  id            uuid primary key default uuid_generate_v4(),
  email         text not null unique,
  password_hash text not null,
  name          text not null,
  avatar_url    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_users_email on users(email);

-- ── 2. LEADS ─────────────────────────────────────────────────
create table leads (
  id                uuid primary key default uuid_generate_v4(),
  full_name         text not null,
  email             text,
  phone             text,
  company           text,
  job_title         text,
  source            text,
  status            text not null default 'new'
                    check (status in ('new','contacted','called','interested',
                                      'closed','completed','rejected','lost','follow_up_needed')),
  notes             text,
  assigned_owner_id uuid references users(id) on delete set null,
  next_follow_up    date,
  import_id         uuid,
  created_by        uuid references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_leads_status         on leads(status);
create index idx_leads_email          on leads(email);
create index idx_leads_assigned_owner on leads(assigned_owner_id);
create index idx_leads_next_follow_up on leads(next_follow_up);
create index idx_leads_created_at     on leads(created_at desc);
create index idx_leads_fts on leads using gin(
  to_tsvector('english',
    coalesce(full_name,'') || ' ' ||
    coalesce(email,'')     || ' ' ||
    coalesce(company,'')
  )
);

-- ── 3. LEAD STATUS HISTORY ───────────────────────────────────
create table lead_status_history (
  id              uuid primary key default uuid_generate_v4(),
  lead_id         uuid not null references leads(id) on delete cascade,
  old_status      text,
  new_status      text not null,
  changed_by      uuid references users(id) on delete set null,
  changed_by_name text,
  created_at      timestamptz not null default now()
);
create index idx_lsh_lead on lead_status_history(lead_id);

-- ── 4. JOBS ──────────────────────────────────────────────────
create table jobs (
  id              uuid primary key default uuid_generate_v4(),
  title           text not null,
  department      text,
  location        text,
  employment_type text check (employment_type in ('Full-time','Part-time','Contract','Internship')),
  description     text,
  requirements    text,
  salary_range    text,
  skills          text[],
  is_active       boolean not null default true,
  is_urgent       boolean not null default false,
  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_jobs_is_active  on jobs(is_active);
create index idx_jobs_department on jobs(department);
create index idx_jobs_created_at on jobs(created_at desc);

-- ── 5. CANDIDATES ────────────────────────────────────────────
create table candidates (
  id                    uuid primary key default uuid_generate_v4(),
  full_name             text not null,
  email                 text,
  phone                 text,
  current_company       text,
  current_role          text,
  experience_years      int,
  source                text,
  job_id                uuid references jobs(id) on delete set null,
  status                text not null default 'sourced'
                        check (status in ('sourced','screened','shortlisted',
                                          'interview_scheduled','interviewed',
                                          'selected','rejected','onboarded')),
  notes                 text,
  resume_url            text,
  linkedin_url          text,
  portfolio_url         text,
  skills                text[],
  assigned_recruiter_id uuid references users(id) on delete set null,
  created_by            uuid references users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_candidates_status     on candidates(status);
create index idx_candidates_job_id     on candidates(job_id);
create index idx_candidates_email      on candidates(email);
create index idx_candidates_recruiter  on candidates(assigned_recruiter_id);
create index idx_candidates_created_at on candidates(created_at desc);
create index idx_candidates_fts on candidates using gin(
  to_tsvector('english',
    coalesce(full_name,'')      || ' ' ||
    coalesce(current_role,'')   || ' ' ||
    coalesce(current_company,'')
  )
);

-- ── 6. CANDIDATE STATUS HISTORY ──────────────────────────────
create table candidate_status_history (
  id              uuid primary key default uuid_generate_v4(),
  candidate_id    uuid not null references candidates(id) on delete cascade,
  old_status      text,
  new_status      text not null,
  changed_by      uuid references users(id) on delete set null,
  changed_by_name text,
  created_at      timestamptz not null default now()
);
create index idx_csh_candidate on candidate_status_history(candidate_id);

-- ── 7. ACTIVITIES ────────────────────────────────────────────
create table activities (
  id            uuid primary key default uuid_generate_v4(),
  lead_id       uuid references leads(id) on delete cascade,
  candidate_id  uuid references candidates(id) on delete cascade,
  user_id       uuid references users(id) on delete set null,
  user_name     text,
  activity_type text not null
                check (activity_type in ('call','email','meeting','note','status_change','interview')),
  description   text not null,
  created_at    timestamptz not null default now(),
  constraint chk_activity_has_target check (
    lead_id is not null or candidate_id is not null
  )
);
create index idx_activities_lead      on activities(lead_id);
create index idx_activities_candidate on activities(candidate_id);
create index idx_activities_created   on activities(created_at desc);

-- ── 8. TASKS ─────────────────────────────────────────────────
create table tasks (
  id               uuid primary key default uuid_generate_v4(),
  title            text not null,
  description      text,
  task_type        text default 'note'
                   check (task_type in ('call','email','meeting','note','follow_up',
                                        'demo','interview','review','outreach','onboarding','sourcing')),
  due_date         date not null,
  due_time         time,
  priority         text not null default 'medium'
                   check (priority in ('low','medium','high')),
  completed        boolean not null default false,
  completed_at     timestamptz,
  lead_id          uuid references leads(id) on delete cascade,
  candidate_id     uuid references candidates(id) on delete cascade,
  job_id           uuid references jobs(id) on delete cascade,
  assigned_to      uuid references users(id) on delete cascade,
  assigned_to_name text,
  created_by       uuid references users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index idx_tasks_assigned  on tasks(assigned_to);
create index idx_tasks_due       on tasks(due_date);
create index idx_tasks_completed on tasks(completed);
create index idx_tasks_lead      on tasks(lead_id);
create index idx_tasks_candidate on tasks(candidate_id);

-- ── 9. REMINDERS ─────────────────────────────────────────────
create table reminders (
  id           uuid primary key default uuid_generate_v4(),
  title        text not null,
  note         text,
  due_date     date not null,
  due_time     time,
  repeat_type  text not null default 'none'
               check (repeat_type in ('none','daily','weekly','monthly')),
  email_alert  boolean not null default false,
  dismissed    boolean not null default false,
  dismissed_at timestamptz,
  email_sent   boolean not null default false,
  lead_id      uuid references leads(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  user_id      uuid not null references users(id) on delete cascade,
  user_email   text,
  created_at   timestamptz not null default now()
);
create index idx_reminders_user    on reminders(user_id);
create index idx_reminders_due     on reminders(due_date);
create index idx_reminders_active  on reminders(dismissed) where dismissed = false;

-- ── 10. INTERVIEWS ───────────────────────────────────────────
create table interviews (
  id             uuid primary key default uuid_generate_v4(),
  candidate_id   uuid not null references candidates(id) on delete cascade,
  job_id         uuid not null references jobs(id) on delete cascade,
  interview_type text not null,
  scheduled_at   timestamptz not null,
  interviewers   text[],
  notes          text,
  feedback       text,
  rating         int check (rating between 1 and 10),
  completed      boolean not null default false,
  completed_at   timestamptz,
  created_by     uuid references users(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index idx_interviews_candidate on interviews(candidate_id);
create index idx_interviews_job       on interviews(job_id);
create index idx_interviews_scheduled on interviews(scheduled_at);
create index idx_interviews_completed on interviews(completed);

-- ── 11. IMPORTS ──────────────────────────────────────────────
create table imports (
  id          uuid primary key default uuid_generate_v4(),
  filename    text not null,
  user_id     uuid references users(id) on delete set null,
  total_rows  int not null default 0,
  successful  int not null default 0,
  failed      int not null default 0,
  errors      jsonb default '[]',
  created_at  timestamptz not null default now()
);
create index idx_imports_user    on imports(user_id);
create index idx_imports_created on imports(created_at desc);

-- ── 12. AUTO updated_at trigger ──────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_users_upd      before update on users      for each row execute function set_updated_at();
create trigger trg_leads_upd      before update on leads      for each row execute function set_updated_at();
create trigger trg_jobs_upd       before update on jobs       for each row execute function set_updated_at();
create trigger trg_candidates_upd before update on candidates for each row execute function set_updated_at();

-- ── 13. Disable RLS (auth handled in FastAPI) ────────────────
alter table users                    disable row level security;
alter table leads                    disable row level security;
alter table lead_status_history      disable row level security;
alter table jobs                     disable row level security;
alter table candidates               disable row level security;
alter table candidate_status_history disable row level security;
alter table activities               disable row level security;
alter table tasks                    disable row level security;
alter table reminders                disable row level security;
alter table interviews               disable row level security;
alter table imports                  disable row level security;

-- ── Done ─────────────────────────────────────────────────────
-- All 11 tables created. Copy SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
-- from Supabase Dashboard → Settings → API into your .env file.
