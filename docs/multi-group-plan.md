# Multi–business-unit plan (hybrid model)

**Status:** planned, not yet implemented. Start here when we grow past the first group.

## Goal

Today the app is one flat org. We're launching with a single local business
group, but long-term this could serve the whole company. This plan makes the app
group-aware without painting us into a corner — and it matches the cross-team
networking angle the landing page leans into.

## The model: hybrid

Confirmed decision:

- Every person has a **home group** (their business unit).
- The dashboard **defaults to your home group's clubs**, but you can **browse and
  join other groups' clubs** too. Groups organize; they don't wall people off.
- Admin is **two-tier**: a global program admin (whole company) plus optional
  **per-group admins** who manage only their group.

## Schema changes (additive migration)

Additive and safe to run against the existing database — no data loss. New
columns are **nullable**, then backfilled to a default group.

```sql
-- 1. Groups (business units)
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

-- 2. Seed the launch group and backfill existing rows into it
insert into public.groups (name, slug) values ('<Your local business unit>', 'launch');

-- 3. Home group on profiles; owning group on clubs (nullable first)
alter table public.profiles add column group_id uuid references public.groups (id);
alter table public.clubs    add column group_id uuid references public.groups (id);

update public.profiles set group_id = (select id from public.groups where slug = 'launch') where group_id is null;
update public.clubs    set group_id = (select id from public.groups where slug = 'launch') where group_id is null;

-- 4. Per-group admin grants (a user can admin one or more groups)
create table public.group_admins (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id  uuid not null references public.profiles (id) on delete cascade,
  primary key (group_id, user_id)
);

alter table public.groups enable row level security;
alter table public.group_admins enable row level security;

create policy "groups readable" on public.groups
  for select to authenticated using (true);
create policy "group_admins readable" on public.group_admins
  for select to authenticated using (true);
```

Once every row has a `group_id`, a later migration can make the columns
`not null` if we want to enforce it.

### RLS updates (hybrid = read across, write within)

- **clubs** — keep readable-by-all (hybrid lets people discover other groups'
  clubs). Tighten *write* so a leader can only create a club in a group they
  belong to or admin.
- **enrollments** — hybrid means self-enroll stays open across groups; no change
  needed beyond what exists.
- **weekly_guides** — unchanged (already scoped via club membership/leader/admin).
- Add a `current_group()` SQL helper mirroring `current_role()` for policy use,
  and an `is_group_admin(group_id)` helper.

## App changes (by file)

| File | Change |
|---|---|
| `src/lib/types.ts` | `Group` type; `group_id` on `Profile` and `Club` |
| `src/app/dashboard/page.tsx` | Default to home group; add a group filter / "browse other groups" toggle |
| `src/app/leader/new-club/page.tsx` | Group selector (defaults to home group; admins can pick any) |
| `src/app/clubs/[id]/page.tsx` | Show the club's group as a badge |
| `src/app/admin/page.tsx` | Scope people/books to the admin's group(s); global admin sees all; manage groups + per-group admins |
| First-login flow | Prompt for home group when `profiles.group_id` is null (until we derive it from AD/email) |
| `src/components/ui.tsx` | Optional group label in the nav |

## Group assignment

Phase 1: user picks their home group on first login (self-select).
Later: derive it automatically from AD attributes or email patterns so people
land in the right unit without choosing.

## Rollout phases

1. **Migration** — apply the groups migration; everyone lands in the launch group.
   App behaves exactly as today (single group).
2. **Group-aware UI** — dashboard filter, new-club selector, club badge.
3. **Per-group admin** — `group_admins` grants + scoped admin console.
4. **Auto-assignment** — derive home group from AD/email.

Each phase ships independently and is safe to pause between.

## Open questions

- Source of truth for group membership — self-select now, AD/email later? Which
  AD attribute (department? cost center?) maps to a business unit?
- Should the first-ever user stay a **global** admin, with per-group admins added
  under them? (Assumed yes.)
- Naming: "business unit," "group," or something employees will recognize?
