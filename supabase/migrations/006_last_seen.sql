-- ============================================================
-- 006: Track "last seen" for the admin engagement view.
--
-- last_sign_in_at (from auth) only updates on an actual password
-- sign-in, so it undercounts people who stay logged in. This column
-- is stamped on authenticated navigation (throttled in middleware),
-- giving a truer "last active in the app" signal.
--
-- The existing "users update own profile" policy (migration 002) pins
-- role + approved in its WITH CHECK but allows the row's other columns
-- to change, so a member updating only last_seen_at on their own row
-- passes RLS — no policy change needed.
-- ============================================================

alter table public.profiles
  add column if not exists last_seen_at timestamptz;
