# Football Tournament Hub — Architecture & Handoff Spec

## 1. What this is

A tournament management system for **BFL Season IX** (4 August 2026) — 8 teams,
5-a-side, 6–8-player squads, one team per APU semester/batch:

- **Public site** — read-only, for spectators: live match status, fixtures,
  league standings, top scorers/assists, and a per-team squad/pitch view.
- **Admin portal** (`/admin`) — single admin, used pitch-side: manage teams,
  players, fixtures, and log live scores/goals/assists/cards during a match.

Real team names, managers, and 48 players (from BFL's official roster
posters and fixture list) are seeded via `prisma/seed.ts` — see §5. Player
photos are not in scope yet (the team's Canva player-card deck sits behind
a login wall that blocks batch export; revisit if photos are wanted later).

### Key product decisions

- **Standings and player stats are derived, not stored.** They're computed
  from `Match`/`MatchEvent` rows on every read (`lib/standings.ts`,
  `lib/playerStats.ts`), so a corrected score or an undone event can never
  leave a stale points table.
- **Live updates via polling, not websockets.** The public home page polls
  `GET /api/public/live` every ~7s **only while a match is `LIVE`** — no
  polling happens when nothing is live.
- **Single-admin auth**, no user accounts: one shared `ADMIN_PASSWORD` +
  an HMAC-SHA256-signed session cookie (`lib/adminAuth.ts`, 12h TTL),
  gated by `proxy.ts` (Next.js 16's renamed `middleware.ts`).
- **Semifinal/final fixtures start with both teams `null`** (`TBD vs TBD`)
  until the league phase resolves; the admin assigns them later via
  `/admin/fixtures/[id]`.
- **Undo is exact**: logging a goal writes a `GOAL` row (+ optional `ASSIST`
  row) sharing a `groupId`; "Undo last event" deletes every row in the
  latest `groupId` and decrements the score by exactly what that group
  added.
- **Destructive admin actions require re-entering the password**, not just
  a confirm dialog: deleting a team/player/fixture and undoing a live event
  all go through `usePasswordConfirm()` (`components/PasswordConfirm.tsx`),
  which POSTs to `/api/admin/verify-password` (checked against
  `ADMIN_PASSWORD`, independent of the session cookie) before proceeding.
- **Players have an optional pitch `position`** (`GK`/`DEF`/`MID`/`FWD`,
  nullable). The public `/teams/[id]` squad page renders players with a
  position on a pitch graphic (`PitchFormation`), and anyone without one
  in an "Extras" sidebar — this is deliberately not a fixed-size formation
  (e.g. not hardcoded to exactly 1 GK/2 DEF/2 MID/1 FWD), just grouped rows,
  so it doesn't break if a team's assigned positions don't match a strict
  6-a-side shape.
- **Light theme by default, dark via a manual toggle** (not
  `prefers-color-scheme`) — `ThemeToggle`/`data-theme` on `<html>`,
  persisted to `localStorage` only when dark is chosen, applied before
  paint via an inline script in the root layout to avoid a flash.
- **No minute field on events.** Goals/assists/cards are logged without a
  match-minute — removed by request to keep the live console fast to use
  pitch-side (one less field per tap). The `minute` DB column still exists
  (nullable, always null going forward) rather than being migrated away.
- **Cards don't touch the score.** `YELLOW_CARD`/`RED_CARD` are just another
  `MatchEventType`, logged via the same `/events` endpoint as goals but with
  no score increment and no assist — see §4.
- **Captains and managers are real roster data**, not placeholders:
  `Player.isCaptain` (exactly one per team, toggled via a ★ button in
  `/admin/players`) and `Team.managerName`, both shown on public team/squad
  pages.

## 2. Stack

| Concern    | Choice                                                      |
| ---------- | ------------------------------------------------------------ |
| Framework  | **Next.js 16** (App Router) + React 19 + TypeScript          |
| Styling    | Tailwind CSS v4, CSS-variable palette (green + red, Bangladesh-flag-inspired per the [@apubfl](https://www.instagram.com/apubfl/) reference), light default + manual dark toggle |
| Database   | Postgres via **Prisma 7** + `@prisma/adapter-neon` (Neon)     |
| Admin auth | `proxy.ts` gate + HMAC cookie (`lib/adminAuth.ts`), no user table |
| Validation | `zod` (`lib/validation.ts`)                                   |
| Deployment | Cloudflare Workers via `@opennextjs/cloudflare` (not Pages)   |

> **Next.js 16, not 15** — `create-next-app@latest` installed 16.2.11.
> Breaking changes from 15 that affect this codebase: `middleware.ts` is
> renamed to `proxy.ts` (exported function `proxy`, **nodejs runtime only**,
> no more edge runtime for it — this is actually fine here since Cloudflare
> Workers via OpenNext run everything under `nodejs_compat` anyway); and
> `params`/`cookies()` are fully async everywhere (no sync fallback).

## 3. Information architecture

```
/                                  Home — live widget (live match, or next fixture + last result)
/fixtures                          All matches by round, scores once played
/standings                         League table (P/W/D/L/GF/GA/GD/Pts)
/players                           Top scorers / top assists
/admin/login                       Password login → sets HMAC cookie
/admin                             Dashboard — live banner, counts, quick links
/admin/teams                       Team CRUD
/admin/players                     Player CRUD (filterable by team)
/admin/fixtures                    Fixture list by round + create form
/admin/fixtures/[id]                Edit fixture (assign teams/date/venue), Start Match
/admin/live/[matchId]               Live match console
/teams                              Team picker (crest cards)
/teams/[id]                         Squad — pitch formation + extras sidebar
GET  /api/public/live               Public poll target (live match or next/last)
POST /api/admin/login  /logout      Session cookie set/clear
POST /api/admin/verify-password     Re-checks ADMIN_PASSWORD for a pending destructive action
*    /api/admin/teams(/[id])        Team CRUD
*    /api/admin/players(/[id])      Player CRUD (includes `position`)
*    /api/admin/fixtures(/[id])     Fixture CRUD
POST /api/admin/fixtures/[id]/start    SCHEDULED → LIVE
POST /api/admin/fixtures/[id]/finish   LIVE → FINISHED
POST /api/admin/fixtures/[id]/events   Log a goal (+ optional assist)
DELETE /api/admin/fixtures/[id]/events/latest   Undo the last logged goal/assist (password-gated)
```

`proxy.ts` gates `/admin/:path*` and `/api/admin/:path*` (except
`/admin/login` and `/api/admin/login`).

## 4. Live match flow (core mechanism)

```
Admin → /admin/fixtures/[id] → assign home/away teams → Start match
  → POST /api/admin/fixtures/[id]/start (SCHEDULED → LIVE, requires both teams set)
  → redirects to /admin/live/[matchId]

Admin → LiveConsole (client component)
  ├─ +Goal (per team) → pick scorer, optional assist
  │    → POST /api/admin/fixtures/[id]/events { type: "GOAL", ... }
  │       writes GOAL row (+ ASSIST row if picked), shared groupId
  │       increments homeScore/awayScore in one transaction
  ├─ Card (per team) → pick player, Yellow or Red
  │    → POST /api/admin/fixtures/[id]/events { type: "YELLOW_CARD"|"RED_CARD" }
  │       writes one event row, groupId of its own, score untouched
  ├─ Undo last event (password-gated) → DELETE .../events/latest
  │       deletes the latest groupId's rows, decrements score to match
  │       (0 for card-only groups)
  └─ Finish match → POST .../finish (LIVE → FINISHED)

Meanwhile, public Home page (if a match is LIVE):
  LiveStatusWidget polls GET /api/public/live every ~7s
  → shows live score + last 10 events, stops polling once FINISHED
```

Standings/player-stats pages don't poll — they're plain Server Components
re-queried on every request (`dynamic = "force-dynamic"`), so a page refresh
always reflects the latest finished/live matches.

## 5. Data model

See `prisma/schema.prisma`. Summary:

- `Team` — `name` (unique), `shortName`, `managerName`.
- `Player` — `name`, `jerseyNumber` (unique per team), optional `position`
  (`GK`/`DEF`/`MID`/`FWD`, null = "extra"/bench), `isCaptain`, belongs to a `Team`.
- `Match` — `round` (`LEAGUE`/`SEMIFINAL`/`FINAL`), `homeTeamId`/`awayTeamId`
  (nullable — TBD until assigned), `status` (`SCHEDULED`/`LIVE`/`FINISHED`),
  `homeScore`/`awayScore`, `scheduledAt`, `venue`.
- `MatchEvent` — `type` (`GOAL`/`ASSIST`/`YELLOW_CARD`/`RED_CARD`), `teamId`,
  `playerId`, `minute?` (nullable, unused — see key decisions above),
  `groupId` (pairs a goal with its assist for atomic undo; card events get
  a groupId of their own).

Seed script (`prisma/seed.ts`): the real BFL Season IX data, taken from the
inter-batch registration form — 8 teams (Molom Bahini, Big Banana FC,
Koshai-7, GENJAM-101, কমিটির টীম, Fall 25, ৭ এ ৭ FC, The Bottleneck), each
with its batch representative as `managerName` and a 6–8 player squad, plus
the full 4 August match schedule: a 28-match single round-robin with real
kickoff times and pitch assignments, 2 semifinal placeholders (1st v 4th,
2nd v 3rd — standard bracket, changed from Season VIII's own 1v3/2v4), and
1 final
placeholder.

**The seed rewrites the season from scratch** — it deletes every event,
prediction, match, player and team before inserting. There is no season
scoping in the schema, so re-running it discards the current season's results.

Scheduling rules encoded in `LEAGUE_SCHEDULE`: 7-minute games on a 10-minute
slot (3 min buffer), kickoff 17:00 JST, Field 2 available only for the
18:00–19:00 hour. That hour runs 12 games two at a time — the `abcd`
round-robin interleaved with the `efgh` round-robin — so those eight teams
alternate slots and never play back to back. The 17:50 and 19:00 slots are
intentionally empty changeovers either side of it. Two assertions run before
any write: `assertSingleRoundRobin` (every pair meets exactly once) and
`assertRestGuarantee` (no team booked twice in a slot, none in consecutive
slots). Worst-case rest between a team's games is 13 minutes.

## 6. Environment variables

| Var                    | Purpose                                              | Required? |
| ---------------------- | ----------------------------------------------------- | --------- |
| `DATABASE_URL`         | Neon **pooled** connection string (runtime, via `PrismaNeon`) | **yes** |
| `DIRECT_URL`           | Neon **unpooled** connection string (migrations only) | **yes** |
| `ADMIN_PASSWORD`       | Password for `/admin/login`                           | **yes** |
| `ADMIN_SESSION_SECRET` | Random secret signing the admin session cookie         | **yes** |

Local dev: skip local Postgres — develop directly against a real Neon dev
branch (free/instant to create) so the `@prisma/adapter-neon` code path
matches production exactly (it talks to Neon over HTTP, not raw TCP, so a
generic local Postgres won't work with it without Neon's separate local
proxy).

## 7. Deployment (Netlify + Neon)

**Superseded 2026-08-02** — the original plan below was Cloudflare Workers via
`@opennextjs/cloudflare`; that scaffolding (`wrangler.jsonc`,
`open-next.config.ts`) was dropped and the project actually runs on
**Netlify** (`@netlify/plugin-nextjs`, see `netlify.toml`). Live at
`bfl.online.zahan.jp`, project `bfl-season-viii-siam` (name is stale, site
predates the Season IX rename). Deploys are **manual CLI**
(`deploy_source: "cli"`, no `commit_ref`) via the Netlify MCP's `deploy-site`
tool or `netlify deploy --prod` locally — pushing to GitHub does **not**
trigger a deploy on its own.

Two Neon connection strings still apply as before: pooled (`DATABASE_URL`,
runtime, via `@prisma/adapter-neon`) and direct (`DIRECT_URL`, migrations).

<details>
<summary>Original Cloudflare plan (not used)</summary>

Target was **Cloudflare Workers** (not Pages) via `@opennextjs/cloudflare` —
`next-on-pages` is effectively deprecated and lacks SSR/middleware parity.

1. `wrangler.jsonc` (`nodejs_compat` flag, `.open-next/worker.js`),
   `open-next.config.ts`, `next.config.ts` calling
   `initOpenNextCloudflareForDev()`.
2. Workers can't open raw TCP, so `@prisma/adapter-neon` (HTTP/WebSocket)
   replaces the usual `pg` driver.
3. CI/CD: GitHub Actions, not Cloudflare's built-in Git integration, so
   `prisma migrate deploy` is an explicit, failable step before the Worker
   ships: `npm ci` → `npm run build` (generate + migrate + `next build`) →
   `npm run cf:build` (OpenNext) → `wrangler deploy`.
4. Custom domain: add the domain as a Cloudflare DNS zone, then Workers &
   Pages → project → Triggers → Custom Domains.

</details>

## 8. Future upgrades (not in scope now)

- Player photos — the BFL Canva player-card deck has real photos per player
  but sits behind a Canva login wall that blocks batch export; no `photoUrl`
  field exists yet either. Revisit if this becomes a priority.
- Team crest images — currently a generated `Crest` SVG (name-hashed colour +
  initials, see §10) rather than each team's actual logo. Swappable per-team
  any time via the manager portal's logo upload, which overrides the
  generated crest automatically.
- Head-to-head tiebreaker for standings (currently: points → GD → GF only).
- A cards/discipline column on the standings or player-stats pages (card
  events are logged and undoable today, just not surfaced as a stat yet).

## 10. Season IX additions (2026-08-02)

Added on top of the original build, once Season IX's real teams/schedule
replaced the Season VIII seed data:

- **`Team.semester` (Int?)** — which APU batch a team represents, added via
  migration `20260802042820_add_team_semester`. Powers the semester sort on
  the roster page; nullable for any team created by hand later that has no
  batch to attach.
- **Full roster page** (`/roster`, `lib/roster.ts`, `components/RosterList.tsx`)
  — every player across every team in one sortable list, toggling
  semester high↔low (default high, ties broken by team name then jersey
  number). `lib/semester.ts` holds the ordinal-suffix formatter
  (`5` → `"5th"`) split out into its own file specifically so a client
  component can import it without pulling `lib/db` (and Prisma) into the
  browser bundle — that pull broke the Turbopack client build the first time
  the formatter lived in `lib/roster.ts` alongside the Prisma query.
- **Generated team crests** (`components/Crest.tsx`) — Season IX teams
  registered with no artwork, so rather than source logos online (copyright
  risk) the fallback crest now hashes the team name into an HSL colour and
  renders its initials (handles Bengali names too, e.g. কমিটির টীম → কট),
  replacing the old plain grey-square/generic-shield placeholder everywhere
  a team logo is shown.
- **Reset match** (`DELETE /api/admin/fixtures/[id]/events`, wired into
  `LiveConsole`) — clears every event for a match and zeroes the score,
  distinct from the existing "undo last event." Same admin-password
  re-confirmation gate as other destructive actions.
- **Populate semifinals from standings** (`POST
  /api/admin/fixtures/populate-semis`, button on `/admin/fixtures`) —
  computes the league table via `lib/standings.ts` and assigns SF1 = 1st vs
  4th, SF2 = 2nd vs 3rd (Season IX's bracket, changed from Season VIII's 1st
  v 3rd / 2nd v 4th). Refuses if any team still has games left, or if the
  fixture list doesn't have exactly two `SEMIFINAL` matches to fill.
- **Champion-prediction result** (`lib/predictions.ts#getChampionResult`,
  `components/ChampionResultBanner.tsx`) — once the Final is `FINISHED` with
  a clear winner, the `/predictions` page shows the actual champion and
  names everyone whose Champions Prediction pick matched (anonymous correct
  picks are folded into a "+N anonymous" count rather than dropped).
- Per-match "who wins this game" widget (`PredictionBar`) relabeled
  **"Winner Prediction"** — it was sharing the "🏆 Champions Prediction"
  label with the season-long pick-the-champion game, which read as the same
  feature when it isn't.
- Team crests/logos sized up ×1.25 across every render site (header brand
  mark, fixtures, standings, teams, live widget, prediction bars, admin
  dashboard) by request.
- Hyperlinks added wherever a team name/logo appears as plain text on public
  pages (fixtures rows, standings crest, live widget, player stat lists) —
  each now links to that team's `/teams/[id]` squad page. Skipped on the
  vote-casting buttons themselves (`PredictionBar`, `ChampionPredictionForm`)
  since nesting a link inside a button that already navigates-on-click would
  be a UX conflict, not an oversight.

## 11. Verification (run before considering this done)

- `npm run db:seed` → 8 teams, 56 players, 31 fixtures (28 league + 2 semi
  + 1 final).
- Full mock match through the live console (goal with assist, yellow card,
  undo, finish) → confirm cards don't move the score and standings math is
  correct afterward.
- Public home page open in a second tab while a match is `LIVE` → score
  updates within ~10s with no manual refresh; polling stops once finished.
- Assign teams to a semifinal fixture → public Fixtures page flips from
  "TBD vs TBD" to real names.
- `npm run build` clean, then `opennextjs-cloudflare build` + local
  `wrangler` preview before a real deploy (tests the actual Workers runtime
  + `PrismaNeon` + cookie auth together).
