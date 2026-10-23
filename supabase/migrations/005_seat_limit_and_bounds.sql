-- ============================================================
-- 005: Fix the enrollment seat-limit check + bound club numbers.
--
-- QA found two issues:
--
-- 1. The "self enroll in open clubs" policy's seat-count subquery had a
--    column-shadowing bug. In `(select count(*) from enrollments e
--    where e.club_id = club_id)`, the unqualified `club_id` bound to the
--    INNER `e.club_id`, so the predicate was `e.club_id = e.club_id`
--    (always true) — counting EVERY enrollment in the whole table, not
--    the target club's roster. Effect: per-club seat caps were never
--    enforced, and once total enrollments reached any club's max_seats,
--    all enrollment into clubs with that cap was rejected as "full".
--    Fix: qualify every reference to the NEW row as `enrollments.club_id`
--    so it can't be shadowed by the inner alias `e`.
--
-- 2. clubs.max_seats / clubs.weeks had no bounds, so a crafted or mis-
--    entered insert (e.g. max_seats:0 = a club nobody can join, or
--    weeks:0/huge = broken guide generation) was accepted. Add CHECK
--    constraints matching the new-club form's ranges.
-- ============================================================

drop policy if exists "self enroll in open clubs" on public.enrollments;
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

-- Ranges mirror the new-club form (seats 3–100, weeks 4–13). If either
-- ALTER errors, an existing test club is out of range — fix or delete it
-- first, then re-run.
alter table public.clubs
  add constraint clubs_max_seats_range check (max_seats between 3 and 100);
alter table public.clubs
  add constraint clubs_weeks_range check (weeks between 4 and 13);
