# Bet This Guy

Source code for the Bet This Guy sports-prop board, parlay tools, live movement, published-pick history, automated grading, and optional user accounts.

## What is included

- Responsive mobile and desktop betting board
- Prop search, game and sportsbook filters, saved picks, and bet slip
- Premade parlays and parlay generator
- Live game state and line movement
- Timestamped public recommendations and grading
- Optional Supabase authentication (email/password, Google, and Apple)
- Per-user settings, saved items, tracked bets, results, profit/loss, and ROI
- Cloudflare D1 schema and Drizzle migrations
- Regression tests for feeds, grading, publishing, bookmarks, accounts, and scheduled maintenance

## Local setup

Requires Node.js 22 or newer.

```bash
npm ci
npm test
npm run build
```

The production Worker is generated at `dist/server/index.js`. Do not edit that generated file directly; edit the files in `worker/` and `dist/`, then run the build.

## Production configuration

The Worker expects these server-side secrets/bindings:

- `DB`: Cloudflare D1 database binding
- `THE_ODDS_API_KEY`: sportsbook market data
- `BALLDONTLIE_API_KEY`: box scores and grading data
- `MAINTENANCE_TOKEN`: authorization for scheduled maintenance endpoints

Never commit those secret values. The Supabase publishable browser key is intentionally public; Supabase Row Level Security and the site API enforce access control.

Before enabling social-login buttons, configure the Google and Apple providers in Supabase Auth and add the production and local callback URLs. Email confirmation and password-reset redirects must also be allow-listed in Supabase.

## Database migrations

Migrations are in `drizzle/`. Apply them in order to a new D1 database. The current schema source is `db/schema.ts` and Drizzle configuration is in `drizzle.config.ts`.

## Important product behavior

- Visitors can browse without an account.
- Signing in is required to sync settings, saved picks, and personal betting records.
- The server calculates odds and payouts for tracked bets; it does not trust client totals.
- Tracked bets lock when their first game starts.
- Authentication credentials are handled by Supabase Auth. The site does not store passwords.
- User records are isolated by authenticated user ID.

This product is for informational and entertainment purposes. Users should verify sportsbook lines before placing a wager.

## Scheduler

This repository also runs Bet This Guy's automatic publishing, grading and closing-line capture through `.github/workflows/btg-maintenance.yml`. Activation steps are in `scripts/MAINTENANCE-SETUP.md`.

### Health

The badge above is green when the latest maintenance run succeeded and red when attention is needed. Open **Actions**, choose the latest run and read its summary to see:

- whether the scheduler was in an active NFL window or a quiet period;
- which maintenance jobs ran;
- whether publishing, grading and closing-line capture completed; and
- whether a quiet-period check avoided provider calls.

### API budget guardrails

The timer checks every five minutes, but provider calls are throttled automatically:

- During active NFL windows, closing-line capture checks every five minutes, grading runs about every ten minutes and publishing runs about every fifteen minutes.
- During quiet periods, most runs make zero provider calls.
- A lightweight publishing and grading checkpoint runs every six hours during quiet periods.
- Manual and workflow-change verification runs execute all three jobs.

The repository contains no sportsbook or stats-provider API keys. The maintenance credential is stored only as an encrypted GitHub Actions secret.
