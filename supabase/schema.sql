-- =============================================================
-- Book Club — complete database schema
--
-- One paste-and-run script for a FRESH install. Run it once in the
-- Supabase SQL editor (Database -> SQL Editor -> New query), or apply it
-- with the Supabase CLI / psql against your database.
--
-- It creates every table, the Supabase Auth integration (automatic
-- profile bootstrap + an optional email-domain lock), and all Row Level
-- Security policies. Targets PostgreSQL + Supabase Auth: it references
-- auth.users and auth.uid() and relies on RLS for authorization.
-- =============================================================

-- ---------- Enum types ----------
create type public.user_role as enum ('admin', 'leader', 'member');
create type public.book_status as enum ('suggested', 'approved', 'rejected');
create type public.club_status as enum ('draft', 'open', 'active', 'completed');

-- =============================================================
-- Tables
-- =============================================================

-- ---------- Profiles (one per auth user) ----------
-- Created automatically on signup by handle_new_user(): the first ever
-- account becomes an approved admin; everyone after signs up pending
-- (approved = false) until an admin approves them in-app. business_group
-- and department are chosen at signup; last_seen_at is stamped on
-- authenticated navigation for the admin engagement view.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  first_name text,
  last_name text,
  full_name text,
  business_group text,
  department text,
  role public.user_role not null default 'member',
  approved boolean not null default false,
  last_seen_at timestamptz,
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
-- Seat/week ranges mirror the new-club form (seats 3-100, weeks 4-13).
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quarter text not null,            -- e.g. '2026-Q4'
  description text,
  book_id uuid references public.books (id) on delete set null,
  leader_id uuid not null references public.profiles (id) on delete cascade,
  max_seats int not null default 15
    constraint clubs_max_seats_range check (max_seats between 3 and 100),
  weeks int not null default 12
    constraint clubs_weeks_range check (weeks between 4 and 13),
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
-- `released` gates member visibility: a guide stays hidden from members
-- until the leader releases it (leaders/admins always see every week).
create table public.weekly_guides (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  week_number int not null,
  theme text not null,
  reading_assignment text,
  summary text,
  discussion_questions jsonb not null default '[]',
  talking_points jsonb not null default '[]',
  released boolean not null default false,
  created_at timestamptz not null default now(),
  unique (club_id, week_number)
);

-- ---------- Guide reactions ----------
create table public.guide_reactions (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.weekly_guides (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '💡', '🔥', '❤️', '🎯')),
  created_at timestamptz not null default now(),
  unique (guide_id, user_id, emoji)
);
create index guide_reactions_guide_idx on public.guide_reactions (guide_id);

-- ---------- Club / book ratings (anonymous feedback for admins) ----------
create table public.club_ratings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  book_rating int check (book_rating between 1 and 5),
  club_rating int check (club_rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, user_id)
);

-- ---------- Book recommendation board (global) ----------
create table public.book_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  author text,
  note text,
  created_at timestamptz not null default now()
);
create index book_recommendations_created_idx on public.book_recommendations (created_at desc);

create table public.recommendation_votes (
  recommendation_id uuid not null references public.book_recommendations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recommendation_id, user_id)
);

-- ---------- Allowed email domains (optional signup lock) ----------
-- Add rows to turn the lock on; while the table is empty, any email may
-- sign up (an admin still approves each account). The UI and server action
-- also check NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS; this table + the trigger
-- below are defense in depth. Keep the two in sync.
create table public.allowed_email_domains (
  domain text primary key check (domain = lower(domain) and domain not like '%@%')
);

-- =============================================================
-- Supabase Auth integration (triggers on auth.users)
-- =============================================================

-- Optional backstop: reject signups outside the approved email domains.
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

-- Auto-create a profile on signup. The FIRST ever account becomes an
-- approved admin; everyone after signs up pending. Name, business group
-- and department are read from the signup metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_first      boolean := not exists (select 1 from public.profiles);
  assigned_role public.user_role := case when is_first then 'admin' else 'member' end;
  first_nm      text := coalesce(new.raw_user_meta_data ->> 'first_name', '');
  last_nm       text := coalesce(new.raw_user_meta_data ->> 'last_name', '');
  full_nm       text := coalesce(
                          nullif(new.raw_user_meta_data ->> 'full_name', ''),
                          nullif(trim(first_nm || ' ' || last_nm), '')
                        );
  biz_group     text := nullif(new.raw_user_meta_data ->> 'business_group', '');
  dept          text := nullif(new.raw_user_meta_data ->> 'department', '');
begin
  insert into public.profiles
    (id, email, first_name, last_name, full_name, business_group, department, role, approved)
  values
    (new.id, new.email, first_nm, last_nm, full_nm, biz_group, dept, assigned_role, is_first);
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
alter table public.guide_reactions enable row level security;
alter table public.club_ratings enable row level security;
alter table public.book_recommendations enable row level security;
alter table public.recommendation_votes enable row level security;
alter table public.allowed_email_domains enable row level security;
-- allowed_email_domains gets no policies: only the service role / SQL editor
-- can read or write it.

-- Helpers: look up the caller's role / approval without recursive RLS.
create or replace function public.current_role()
returns public.user_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_approved()
returns boolean
language sql stable security definer set search_path = public
as $$
  select approved from public.profiles where id = auth.uid();
$$;

-- ---------- Profiles ----------
-- Everyone signed in can read; users update their own row (but can't
-- self-promote or self-approve); admins update any row.
create policy "profiles readable by authenticated" on public.profiles
  for select to authenticated using (true);
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = public.current_role()        -- can't self-promote
    and approved = public.current_approved() -- can't self-approve
  );
create policy "admins update any profile" on public.profiles
  for update to authenticated using (public.current_role() = 'admin');

-- ---------- Books ----------
create policy "books readable" on public.books
  for select to authenticated using (true);
create policy "leaders suggest books" on public.books
  for insert to authenticated with check (public.current_role() in ('leader','admin'));
create policy "admins evaluate books" on public.books
  for update to authenticated using (public.current_role() = 'admin');
create policy "admins delete books" on public.books
  for delete to authenticated using (public.current_role() = 'admin');

-- ---------- Clubs ----------
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

-- ---------- Enrollments ----------
-- Users see all rosters (internal); self-enroll in an open club with a free
-- seat; drop self. Every reference to the NEW row is qualified as
-- enrollments.club_id so the inner alias `e` can't shadow it in the count.
create policy "enrollments readable" on public.enrollments
  for select to authenticated using (true);
create policy "self enroll in open clubs" on public.enrollments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.clubs c
      where c.id = enrollments.club_id and c.status = 'open'
    )
    and (
      select count(*) from public.enrollments e
      where e.club_id = enrollments.club_id
    ) < (
      select c.max_seats from public.clubs c where c.id = enrollments.club_id
    )
  );
create policy "self unenroll" on public.enrollments
  for delete to authenticated using (user_id = auth.uid());

-- ---------- Weekly guides ----------
-- Members see a guide only once it's released; the club leader and admins
-- always see every week (preview + manage release). The FOR ALL write
-- policy lets the leader/admin flip `released`.
create policy "guides readable by club members" on public.weekly_guides
  for select to authenticated using (
    (
      weekly_guides.released
      and exists (
        select 1 from public.enrollments e
        where e.club_id = weekly_guides.club_id and e.user_id = auth.uid()
      )
    )
    or exists (
      select 1 from public.clubs c
      where c.id = weekly_guides.club_id and c.leader_id = auth.uid()
    )
    or public.current_role() = 'admin'
  );
create policy "leaders write guides" on public.weekly_guides
  for all to authenticated using (
    exists (select 1 from public.clubs c where c.id = weekly_guides.club_id and c.leader_id = auth.uid())
    or public.current_role() = 'admin'
  );

-- ---------- Guide reactions ----------
-- React with your own emoji, only on a guide you can see (enrolled, leading,
-- or admin) — mirrors guide visibility.
create policy "reactions readable" on public.guide_reactions
  for select to authenticated using (true);
create policy "react on visible guides" on public.guide_reactions
  for insert to authenticated with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.enrollments e
        join public.weekly_guides g on g.club_id = e.club_id
        where g.id = guide_id and e.user_id = auth.uid()
      )
      or exists (
        select 1 from public.weekly_guides g
        join public.clubs c on c.id = g.club_id
        where g.id = guide_id and c.leader_id = auth.uid()
      )
      or public.current_role() = 'admin'
    )
  );
create policy "remove own reaction" on public.guide_reactions
  for delete to authenticated using (user_id = auth.uid());

-- ---------- Club / book ratings ----------
-- Anonymous feedback for ADMINS. A member reads/writes only their own row;
-- admins read everything. Leaders get no window beyond their own row (they
-- can't see how members rated their club).
create policy "read own rating or admin reads all" on public.club_ratings
  for select to authenticated using (
    user_id = auth.uid() or public.current_role() = 'admin'
  );
create policy "rate clubs you're enrolled in" on public.club_ratings
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.enrollments e
      where e.club_id = club_ratings.club_id and e.user_id = auth.uid()
    )
  );
create policy "update own rating" on public.club_ratings
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------- Book recommendation board ----------
create policy "recommendations readable" on public.book_recommendations
  for select to authenticated using (true);
create policy "add own recommendation" on public.book_recommendations
  for insert to authenticated with check (user_id = auth.uid());
create policy "delete own recommendation or admin" on public.book_recommendations
  for delete to authenticated using (
    user_id = auth.uid() or public.current_role() = 'admin'
  );

create policy "votes readable" on public.recommendation_votes
  for select to authenticated using (true);
create policy "cast own vote" on public.recommendation_votes
  for insert to authenticated with check (user_id = auth.uid());
create policy "remove own vote" on public.recommendation_votes
  for delete to authenticated using (user_id = auth.uid());
