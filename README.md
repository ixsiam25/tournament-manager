# Football Tournament Hub

Public site (live status, fixtures, standings, player stats) + a
single-admin portal for managing teams/players/fixtures and logging live
scores. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

## Setup

1. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` / `DIRECT_URL` — a [Neon](https://neon.tech) Postgres
     project's pooled and direct connection strings.
   - `ADMIN_PASSWORD` — the admin portal password.
   - `ADMIN_SESSION_SECRET` — `openssl rand -hex 32`.
2. `npm install`
3. `npm run db:migrate` — creates the tables.
4. `npm run db:seed` — seeds 6 placeholder teams (A–F), players, and all
   league/semifinal/final fixtures.
5. `npm run dev` — public site at `/`, admin at `/admin/login`.

## Scripts

- `npm run dev` — local dev server
- `npm run build` — `prisma generate && prisma migrate deploy && next build`
- `npm run db:seed` — re-seed placeholder data
- `npm run db:migrate` — create a new migration in dev
