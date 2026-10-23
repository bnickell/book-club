-- =============================================================
-- Book Club — engagement features
--   1. Progressive weekly-guide release (leader-controlled)
--   2. Emoji reactions on weekly guides
--   3. Member ratings of the book + club (admin-only visibility)
--   4. Global book-recommendation board with upvotes
-- Run in the Supabase SQL editor (after 001 + 002).
-- =============================================================

-- ---------- 1. Weekly-guide release ----------
alter table public.weekly_guides
  add column if not exists released boolean not null default false;

-- Grandfather guides that already exist so current members keep their access
-- (new guides generated from here on start hidden until a leader releases them).
update public.weekly_guides set released = true;

-- Members now see a guide only once it's released; the club leader and admins
-- always see every week (so they can preview + manage release).
drop policy if exists "guides readable by club members" on public.weekly_guides;
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
-- (The existing "leaders write guides" FOR ALL policy already lets the
--  leader/admin flip `released`.)

-- ---------- 2. Guide reactions ----------
create table public.guide_reactions (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references public.weekly_guides (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '💡', '🔥', '❤️', '🎯')),
  created_at timestamptz not null default now(),
  unique (guide_id, user_id, emoji)
);
create index guide_reactions_guide_idx on public.guide_reactions (guide_id);

alter table public.guide_reactions enable row level security;

create policy "reactions readable" on public.guide_reactions
  for select to authenticated using (true);
-- Insert your own reaction, only on a guide in a club you're part of (enrolled,
-- leading, or admin) — mirrors who can see the guide.
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

-- ---------- 3. Club / book ratings ----------
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

alter table public.club_ratings enable row level security;

-- Ratings are anonymous feedback for ADMINS. A member can read/write only their
-- own row; admins can read everything. Leaders deliberately get no window beyond
-- their own row (they can't see how members rated their club).
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

-- ---------- 4. Book recommendation board (global) ----------
create table public.book_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  author text,
  note text,
  created_at timestamptz not null default now()
);
create index book_recommendations_created_idx on public.book_recommendations (created_at desc);

alter table public.book_recommendations enable row level security;

create policy "recommendations readable" on public.book_recommendations
  for select to authenticated using (true);
create policy "add own recommendation" on public.book_recommendations
  for insert to authenticated with check (user_id = auth.uid());
create policy "delete own recommendation or admin" on public.book_recommendations
  for delete to authenticated using (
    user_id = auth.uid() or public.current_role() = 'admin'
  );

create table public.recommendation_votes (
  recommendation_id uuid not null references public.book_recommendations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recommendation_id, user_id)
);

alter table public.recommendation_votes enable row level security;

create policy "votes readable" on public.recommendation_votes
  for select to authenticated using (true);
create policy "cast own vote" on public.recommendation_votes
  for insert to authenticated with check (user_id = auth.uid());
create policy "remove own vote" on public.recommendation_votes
  for delete to authenticated using (user_id = auth.uid());
