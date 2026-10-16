-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하세요.
-- 금액 단위: 억원

-- 1) 사용자 권한 테이블 (editor = 조회+편집, viewer = 조회만)
create table if not exists public.profiles (
  id    uuid primary key references auth.users(id) on delete cascade,
  role  text not null default 'viewer' check (role in ('viewer', 'editor'))
);

-- 새 사용자가 만들어지면 viewer 로 자동 등록
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role) values (new.id, 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) 권한 확인 함수 (RLS 정책에서 사용)
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'editor');
$$;

-- 3) 회사 테이블
create table if not exists public.companies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  sector           text,
  invest_date      date,
  stage            text,
  invested_amount  numeric not null default 0,   -- 투자금액(억원)
  ownership_pct    numeric,                      -- 지분율(%)
  manager          text,                         -- 담당 심사역
  status           text not null default 'normal' check (status in ('normal', 'watch', 'alert')),
  latest_valuation numeric,                      -- 최근 라운드 밸류(억원)
  fair_value       numeric,                      -- 보유지분 평가액(억원)
  exit_plan        text,
  memo             text,
  updated_at       timestamptz not null default now()
);

-- 4) 현황 이력 테이블 (회사 1 : N)
create table if not exists public.company_updates (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  reported_on      date not null default current_date,
  revenue          numeric,   -- 매출(억원)
  operating_profit numeric,   -- 영업이익(억원)
  cash             numeric,   -- 현금성 자산(억원)
  headcount        integer,
  comment          text,
  created_at       timestamptz not null default now()
);
create index if not exists company_updates_company_idx on public.company_updates (company_id, reported_on desc);

-- 5) 수정 시각 자동 갱신
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_touch on public.companies;
create trigger companies_touch
  before update on public.companies
  for each row execute function public.touch_updated_at();

-- 6) RLS: 로그인 + 등록된 사용자만 조회, editor 만 쓰기
alter table public.profiles        enable row level security;
alter table public.companies       enable row level security;
alter table public.company_updates enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "companies read" on public.companies;
create policy "companies read" on public.companies
  for select to authenticated using (public.is_member());
drop policy if exists "companies write" on public.companies;
create policy "companies write" on public.companies
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

drop policy if exists "updates read" on public.company_updates;
create policy "updates read" on public.company_updates
  for select to authenticated using (public.is_member());
drop policy if exists "updates write" on public.company_updates;
create policy "updates write" on public.company_updates
  for all to authenticated using (public.is_editor()) with check (public.is_editor());

-- 비로그인(anon) 사용자에게는 어떤 정책도 없으므로 데이터가 반환되지 않습니다.

-- 7) 본인 계정을 편집자로 승격하려면 (이메일을 바꿔서 실행)
-- update public.profiles set role = 'editor'
--   where id = (select id from auth.users where email = 'you@example.com');
