-- Ergon 勤怠 スキーマ
-- Supabase の SQL Editor に貼り付けて実行してください。

create extension if not exists pgcrypto;

-- メンバー（Slackで初めて /kintai を使うと自動で登録されます）
create table if not exists members (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slack_user_id text unique,
  created_at    timestamptz not null default now()
);

-- 勤務（出勤〜退勤の1区間）
create table if not exists work_sessions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members(id) on delete cascade,
  started_at timestamptz not null,
  ended_at   timestamptz,
  note       text,
  source     text not null default 'web',   -- 'slack' | 'web'
  created_at timestamptz not null default now(),
  constraint ended_after_started check (ended_at is null or ended_at > started_at)
);

-- 1人につき「勤務中」は1つまで
create unique index if not exists one_open_session_per_member
  on work_sessions (member_id) where ended_at is null;

create index if not exists work_sessions_started_at on work_sessions (started_at);

-- やったことの記録
create table if not exists activity_logs (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members(id) on delete cascade,
  session_id uuid references work_sessions(id) on delete set null,
  content    text not null,
  logged_at  timestamptz not null default now(),
  source     text not null default 'web'
);

create index if not exists activity_logs_logged_at on activity_logs (logged_at);

-- RLS を有効にし、ポリシーは作らない
-- （アプリはサーバー側から service_role キーで接続するため、anon キーからは読み書き不可になる）
alter table members       enable row level security;
alter table work_sessions enable row level security;
alter table activity_logs enable row level security;
