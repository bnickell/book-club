-- =============================================================
-- Book Club — business group + department on profiles
-- Members pick their business group and department at signup so
-- people can browse and filter clubs across groups/departments to
-- network beyond their own team. Clubs inherit group/department
-- from their leader's profile (no columns on clubs).
-- Run in the Supabase SQL editor (or `supabase db push`).
-- =============================================================

-- ---------- Profile columns (nullable: pre-existing users have none) ----------
alter table public.profiles add column if not exists business_group text;
alter table public.profiles add column if not exists department text;

-- ---------- Carry the two fields from signup metadata ----------
-- Re-declares handle_new_user() (from 002) to also read business_group
-- and department out of raw_user_meta_data. Everything else is unchanged:
-- first account becomes an approved admin; the rest sign up pending.
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
