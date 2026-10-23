-- =============================================================
-- Book Club — initial schema
-- Run in Supabase SQL editor or via `supabase db push`
-- =============================================================

-- ---------- Types ----------
create type public.user_role as enum ('admin', 'leader', 'member');
create type public.book_status as enum ('suggested', 'approved', 'rejected');
create type public.club_status as enum ('draft', 'open', 'active', 'completed');

-- ---------- Profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.user_role not null default 'member',
  created_at timestamptz not null default now()
);

-- ---------- Books ----------
create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  year int,
  description text,
  topics text[] not null default '{}',
  ai_rationale text,               -- why the AI recommended it
  status public.book_status not null default 'suggested',
  suggested_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Clubs (one per leader per quarter, typically) ----------
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quarter text not null,            -- e.g. '2026-Q4'
  description text,
  book_id uuid references public.books (id) on delete set null,
  leader_id uuid not null references public.profiles (id) on delete cascade,
  max_seats int not null default 15,
  weeks int not null default 12,    -- discussion weeks in the quarter
  status public.club_status not null default 'draft',
  created_at timestamptz not null default now()
);
create index clubs_quarter_idx on public.clubs (quarter);

-- ---------- Enrollments ----------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (club_id, user_id)
);

-- ---------- Weekly discussion guides (AI-generated, leader-editable) ----------
create table public.weekly_guides (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  week_number int not null,
  theme text not null,
  reading_assignment text,
  summary text,
  discussion_questions jsonb not null default '[]',
  talking_points jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (club_id, week_number)
);

-- =============================================================
-- Domain gating + profile bootstrap
-- =============================================================

-- Optional backstop: restrict auth signups to specific email domains.
-- Add rows to public.allowed_email_domains (see README) to turn the lock on;
-- while the table is empty, any email may sign up (an admin still has to
-- approve each account). The UI and server action also check the list
-- (NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS); the trigger is defense in depth.
create table if not exists public.allowed_email_domains (
  domain text primary key check (domain = lower(domain) and domain not like '%@%')
);
alter table public.allowed_email_domains enable row level security;
-- No policies: only the service role / SQL editor can read or write it.

create or replace function public.enforce_email_domain()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (select 1 from public.allowed_email_domains)
     and not exists (
       select 1 from public.allowed_email_domains d
       where lower(new.email) like '%@' || d.domain
     ) then
    raise exception 'Sign-up is limited to approved email domains.';
  end if;
  return new;
end;
$$;

create trigger enforce_email_domain
  before insert on auth.users
  for each row execute function public.enforce_email_domain();

-- Auto-create a profile row on signup. First user becomes admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  assigned_role public.user_role := 'member';
begin
  if not exists (select 1 from public.profiles) then
    assigned_role := 'admin';
  end if;
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''), assigned_role);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- Row Level Security
-- =============================================================
alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.clubs enable row level security;
alter table public.enrollments enable row level security;
alter table public.weekly_guides enable row level security;

-- Helper: current user's role (avoids recursive RLS lookups)
create or replace function public.current_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Profiles: everyone signed in can read (internal tool); users update own name;
-- admins can update roles.
create policy "profiles readable by authenticated" on public.profiles
  for select to authenticated using (true);
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (id = auth.uid() and role = public.current_role()); -- can't self-promote
create policy "admins update any profile" on public.profiles
  for update to authenticated using (public.current_role() = 'admin');

-- Books: readable by all; leaders/admins insert; admins evaluate (update).
create policy "books readable" on public.books
  for select to authenticated using (true);
create policy "leaders suggest books" on public.books
  for insert to authenticated with check (public.current_role() in ('leader','admin'));
create policy "admins evaluate books" on public.books
  for update to authenticated using (public.current_role() = 'admin');
create policy "admins delete books" on public.books
  for delete to authenticated using (public.current_role() = 'admin');

-- Clubs: readable by all; leaders create/update their own; admins anything.
create policy "clubs readable" on public.clubs
  for select to authenticated using (true);
create policy "leaders create clubs" on public.clubs
  for insert to authenticated
  with check (leader_id = auth.uid() and public.current_role() in ('leader','admin'));
create policy "leaders update own clubs" on public.clubs
  for update to authenticated
  using (leader_id = auth.uid() or public.current_role() = 'admin');
create policy "admins delete clubs" on public.clubs
  for delete to authenticated using (public.current_role() = 'admin');

-- Enrollments: users see all rosters (internal); enroll self in open clubs; drop self.
create policy "enrollments readable" on public.enrollments
  for select to authenticated using (true);
create policy "self enroll in open clubs" on public.enrollments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.clubs c where c.id = club_id and c.status = 'open')
    and (select count(*) from public.enrollments e where e.club_id = club_id)
        < (select max_seats from public.clubs c where c.id = club_id)
  );
create policy "self unenroll" on public.enrollments
  for delete to authenticated using (user_id = auth.uid());

-- Weekly guides: enrolled members + leader + admins read; leader/admin write.
create policy "guides readable by club members" on public.weekly_guides
  for select to authenticated using (
    exists (select 1 from public.enrollments e where e.club_id = weekly_guides.club_id and e.user_id = auth.uid())
    or exists (select 1 from public.clubs c where c.id = weekly_guides.club_id and c.leader_id = auth.uid())
    or public.current_role() = 'admin'
  );
create policy "leaders write guides" on public.weekly_guides
  for all to authenticated using (
    exists (select 1 from public.clubs c where c.id = weekly_guides.club_id and c.leader_id = auth.uid())
    or public.current_role() = 'admin'
  );
