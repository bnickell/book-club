# Book Club

A quarterly workplace book club app — a two-sided marketplace where club
leaders open a club for the quarter, members claim seats, and AI handles book
recommendations and weekly discussion guides.

**Stack:** Next.js 15 (App Router) · Supabase (auth + Postgres + RLS) · Anthropic API · Tailwind

## How access works: request → admin approval → email + password

The app sends **no auth emails** (no SMTP to configure). A visitor requests
access; an admin approves them in-app, which sets a temporary password and
produces a ready-to-paste welcome email the admin sends from their own mailbox.
This is handy in organizations where mail from unknown senders gets filtered.
You can optionally lock sign-ups to specific email domains (see below).

## Roles

| Role | Can do |
|---|---|
| **Admin** | Everything below, plus approve/reject members, promote/demote users, reset passwords, approve or reject book picks |
| **Leader** | Start a club for the upcoming quarter, get AI book recommendations, generate/regenerate weekly guides, release guides week by week |
| **Member** (default) | Browse open clubs, claim a seat, read released weekly guides, react and rate |

## What you need

| Thing | Where to get it | Cost |
|---|---|---|
| Node.js 20.6+ | nodejs.org | free |
| A Supabase project | supabase.com | free tier works |
| An Anthropic API key | console.anthropic.com → API Keys | pay-as-you-go |
| A host (optional) | Vercel, or anything that runs Next.js | see note below |

## Setup, step by step

### 1. Clone and install

```bash
git clone <your-fork-url> book-club
cd book-club
npm install
cp .env.example .env.local
```

### 2. Create the Supabase project and get your keys

1. Create a project at supabase.com.
2. Go to **Project Settings → API** and copy into `.env.local`:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose it or commit it)

### 3. Create the database schema

Open **SQL Editor** in Supabase (**Database → SQL Editor → New query**), paste
the entire contents of `supabase/schema.sql`, and run it once. That single
script creates every table, the Supabase Auth integration (auto-profile trigger
+ optional email-domain lock), and all Row Level Security policies.

Alternatively, apply it with the [Supabase CLI](https://supabase.com/docs/guides/cli):
`supabase link --project-ref <ref>`, then run the file against your database,
e.g. `psql "$DATABASE_URL" -f supabase/schema.sql`.

### 4. Configure Supabase Auth

**Authentication → Providers → Email**:
- Enable the Email provider.
- Enable **Allow new users to sign up**.
- Turn **Confirm email OFF** (accounts are vetted by admin approval, not an email link).

No SMTP settings or email templates are needed.

### 5. (Optional) Lock sign-ups to your email domain

By default anyone can *request* access (an admin still approves each person).
To restrict requests to your organization, do both:

1. In `.env.local` (and your host's env vars):
   ```
   NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=example.com,example.org
   ```
2. In the Supabase SQL Editor, so the database enforces it too:
   ```sql
   insert into public.allowed_email_domains (domain) values ('example.com'), ('example.org');
   ```

Leave both empty for an open club. If you set only one, the form and the
database will disagree.

### 6. Fill in the rest of `.env.local`

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | From step 2 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | From step 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | From step 2. Server only |
| `ANTHROPIC_API_KEY` | yes | console.anthropic.com. Needed for recommendations and guides |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-4-6` |
| `NEXT_PUBLIC_SITE_URL` | yes | `http://localhost:3000` locally; your real URL in production. Used in welcome-email links |
| `NEXT_PUBLIC_APP_NAME` | no | Display name, default "Book Club" |
| `NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS` | no | See step 5 |

### 7. Create the first admin

Because everyone must be approved by an admin, the very first admin is created
with a script. This needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`:

```bash
node --env-file=.env.local scripts/provision-admin.mjs you@example.com "First" "Last"
```

It prints a generated password (or pass your own as a fifth argument). If you
set an email-domain lock, the address must be on the allowed list.

*Alternative:* request access on `/login` as yourself first, then run
`node --env-file=.env.local scripts/bootstrap-admin.mjs you@example.com` to set
a password and mark that account admin.

### 8. Run it

```bash
npm run dev    # http://localhost:3000
```

Sign in at `/login`, open **Admin**, and approve new requests. Approving shows a
welcome email (with a temporary password) to copy into your own mail client.

## Deploying

Vercel works well: import the repo and add every variable from step 6 in
**Project Settings → Environment Variables** (set `NEXT_PUBLIC_SITE_URL` to the
production URL). `generate-guide` sets `maxDuration = 300` because a full 12–13
week guide can take over a minute. **That needs a plan that allows long
functions** (Vercel Pro). On Hobby (60s cap), lower `maxDuration` to 60 and use
shorter guides, or split generation into batches.

## Customizing

- **Branding/name:** `NEXT_PUBLIC_APP_NAME`; colors in `tailwind.config.ts`.
- **Business groups & departments** shown at sign-up: `src/lib/org.ts` (stored as
  plain text, so editing the lists needs no migration).
- **AI prompts and model:** `src/app/api/*/route.ts`, `src/lib/anthropic.ts`.
- **Welcome / reset email text:** `src/lib/welcome.ts`.

## Quarterly model

Clubs are stamped with the *next* quarter at creation (`nextQuarter()` in
`src/lib/types.ts`): built in Q3 2026 → clubs open for **2026-Q4**. Weekly
guides default to 12 weeks (leader-adjustable 4–13).

## Security notes

- Row Level Security is on for every table; anonymous access is denied and write
  policies check role and ownership.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is used only in server code and the
  admin scripts. Never prefix it with `NEXT_PUBLIC_`.
- Never commit `.env.local` (it's gitignored). If a key ever leaks, rotate it in
  Supabase / the Anthropic console.
- Temporary passwords are intentionally readable (`Bright-Chapter-4820`) for a casual
  club; users can change theirs on the profile page. Tighten `generatePassword()` in
  `src/lib/welcome.ts` if your threat model needs more.

## AI flows

- **`POST /api/recommend-books`** (leader/admin): topics → 5 book recommendations as strict JSON.
- **`POST /api/generate-guide`** (club leader/admin): book + week count → per-week theme, reading assignment, summary, 4 discussion questions, 4 leader talking points; upserted into `weekly_guides` so regeneration overwrites cleanly.

## Ideas not built

- Weekly discussion reminders
- In-app guide editing for leaders
- Attendance/completion tracking and a quarterly recap
- "Notify me next quarter" waitlist when a club is full
- Book cover images (Open Library covers API)
- Multi-group support — see `docs/multi-group-plan.md`

## License

MIT -- see [LICENSE](LICENSE).
