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

## Hosting on Cloudflare

betthisguy.com is served by a Cloudflare Worker named `bet-this-guy`, built from this repository. `wrangler.jsonc` configures it with the `bet-this-guy` D1 database. The site used to run on ChatGPT Sites; it moved to Cloudflare on 2026-09-23 with a fresh database.

Cloudflare Workers Builds deploys it, so no Cloudflare credentials are stored in GitHub. The build settings are:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`
- **Root directory:** empty

Each push to `main` applies any new migrations in `drizzle/` and deploys the site. The Worker's secrets `THE_ODDS_API_KEY`, `BALLDONTLIE_API_KEY` and `MAINTENANCE_TOKEN` are set under **Settings**, then **Variables and Secrets**. betthisguy.com is attached to the Worker as a custom domain. Its DNS is managed in Cloudflare, and the registration stays with Namecheap.

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

This repository also runs Bet This Guy's automatic maintenance:

- Publishing and grading run from `.github/workflows/btg-maintenance.yml` on GitHub Actions.
- Closing-line capture runs from the Cloudflare Worker cron in `closing-cron/`. GitHub starts scheduled runs late, often by 5–10 minutes. Cloudflare's cron starts on time, which matters for capturing lines at kickoff.

Activation steps are in `scripts/MAINTENANCE-SETUP.md`.

### Health

The badge above covers publishing and grading. It is green when the latest maintenance run succeeded and red when attention is needed. Open **Actions**, choose the latest run and read its summary to see:

- whether the scheduler was in an active NFL window or a quiet period;
- which maintenance jobs ran;
- whether publishing and grading completed; and
- whether a run with no jobs due avoided provider calls.

For closing-line capture, open the `bet-this-guy-scheduler` Worker in the Cloudflare dashboard and check the log for each cron run. A failed capture is marked as an error there, and when the Worker's `ALERT_NTFY_TOPIC` secret is set, it also sends a push notification through [ntfy](https://ntfy.sh) to phones subscribed to that topic.

### API budget guardrails

The timer checks every five minutes, but provider calls are throttled automatically:

- During active NFL windows, the Cloudflare cron captures closing lines every five minutes, grading runs about every ten minutes and publishing runs about every fifteen minutes.
- During quiet periods, the Cloudflare cron makes no calls and most GitHub runs make zero provider calls.
- A lightweight publishing and grading checkpoint runs every six hours during quiet periods.
- Manual and workflow-change verification runs on GitHub execute all three jobs, including one closing-line capture.

The repository contains no sportsbook or stats-provider API keys. The maintenance credential is stored only as an encrypted GitHub Actions secret and a Cloudflare Worker secret.
