-- =============================================================
-- Book Club — admin-approval auth
-- Converts signup from magic link to request → admin approval →
-- email + password. The app sends NO auth emails; an admin approves
-- in-app and pastes a welcome email from their own mailbox.
-- Run in the Supabase SQL editor (or `supabase db push`).
-- =============================================================

-- ---------- Profile columns ----------
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists approved boolean not null default false;

-- Grandfather everyone who already had access (magic-link era) so the
-- switch to approval-gating never locks an existing member out.
update public.profiles set approved = true;

-- ---------- Profile bootstrap on signup ----------
-- Rewritten to (a) carry the requester's name from user metadata and
-- (b) set the approval flag. The FIRST ever account becomes an approved
-- admin; everyone after signs up pending (approved = false) until an
-- admin approves them in-app.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_first     boolean := not exists (select 1 from public.profiles);
  assigned_role public.user_role := case when is_first then 'admin' else 'member' end;
  first_nm     text := coalesce(new.raw_user_meta_data ->> 'first_name', '');
  last_nm      text := coalesce(new.raw_user_meta_data ->> 'last_name', '');
  full_nm      text := coalesce(
                         nullif(new.raw_user_meta_data ->> 'full_name', ''),
                         nullif(trim(first_nm || ' ' || last_nm), '')
                       );
begin
  insert into public.profiles (id, email, first_name, last_name, full_name, role, approved)
  values (new.id, new.email, first_nm, last_nm, full_nm, assigned_role, is_first);
  return new;
end;
$$;

-- ---------- RLS hardening: can't self-approve ----------
-- Mirror of current_role() so the self-update policy can pin the caller's
-- approved flag to its committed value (defense in depth — a pending user
-- has no password and thus no session, so this can't be reached anyway).
create or replace function public.current_approved()
returns boolean
language sql stable security definer set search_path = public
as $$
  select approved from public.profiles where id = auth.uid();
$$;

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = public.current_role()        -- can't self-promote
    and approved = public.current_approved() -- can't self-approve
  );
