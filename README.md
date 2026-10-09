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

Provider-cost protection: lookups the cache can't answer are rate limited per visitor through Cloudflare rate-limit bindings in `wrangler.jsonc`. Unknown event IDs are limited to 5 a minute; games on the site's own schedule are never limited. Uncached player-stat lookups are limited to 120 a minute. The site's internal calls are never limited.

Optional variable:

- `VISITOR_MAINTENANCE`: leave unset normally. Publishing, grading and closing-line capture run on the GitHub scheduler and the closing-line cron. Set it to `on` only as a fallback if the scheduler is down. Visitor traffic then triggers that work again, at the cost of extra provider calls.

Optional X (Twitter) auto-posts: set `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN` and `X_ACCESS_SECRET` (from an X developer app with Read and write permission; generate the access token after setting that permission). Each new official pick is then posted once with a graphic, right after the pick run that found it: the run calls the Worker through its own `SELF` service binding (`wrangler.jsonc`), so the X post and phone alerts run in a separate invocation with their own request allowance. The in-between cron run still posts anything that misses. Replies under each pick follow: a beat-the-closing-line post at kickoff (only when the price moved our way) and a result graphic once the pick is final, wins and losses alike. A weekly results graphic posts on Tuesdays. Without them nothing is posted. Preview any graphic without posting: `/api/x-card.png?id=<pick id>` (add `&result=1` once graded) or `/api/x-card.png?week=YYYY-MM-DD`.

Never commit those secret values. The Supabase publishable browser key is intentionally public; Supabase Row Level Security and the site API enforce access control.

Before enabling social-login buttons, configure the Google and Apple providers in Supabase Auth and add the production and local callback URLs. Email confirmation and password-reset redirects must also be allow-listed in Supabase.

## Hosting on Cloudflare

betthisguy.com is served by a Cloudflare Worker named `bet-this-guy`, built from this repository. `wrangler.jsonc` configures it with the `bet-this-guy` D1 database. The site used to run on ChatGPT Sites; it moved to Cloudflare on 2026-09-23 with a fresh database.

Cloudflare Workers Builds deploys it, so no Cloudflare credentials are stored in GitHub. The build settings are:

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler d1 migrations apply DB --remote && npx wrangler deploy`
- **Root directory:** empty
- **Preview command** (non-production branches): `npx wrangler preview`

Each push to `main` applies any new migrations in `drizzle/` and deploys the site. Don't apply a migration to the live database by hand before merging: the deploy then fails on it (for example an `ALTER TABLE` adding a column that already exists), and nothing goes live. If that happens, record the migration as applied in the `d1_migrations` table and deploy again. To check that a `main` build really went live, look at its **Workers Builds** check on GitHub: a real deploy has no "Preview URL" line. If a `main` build shows a Preview URL, the deploy command has been replaced by an upload-only command such as `npx wrangler versions upload`. Nothing reaches betthisguy.com until the deploy command above is restored. Pull requests get a preview link from Cloudflare instead. Previews use the `previews` block in `wrangler.jsonc`: their own empty `bet-this-guy-preview` database and separate rate-limit counters, so nothing done on a preview link touches the live record. Previews don't inherit the live secrets; to see odds on a preview, set them once with `npx wrangler preview base-config secret put <NAME>`. When a new migration lands in `drizzle/`, apply it to the preview database too. The Worker's secrets `THE_ODDS_API_KEY`, `BALLDONTLIE_API_KEY` and `MAINTENANCE_TOKEN` are set under **Settings**, then **Variables and Secrets**. betthisguy.com is attached to the Worker as a custom domain. Its DNS is managed in Cloudflare, and the registration stays with Namecheap.

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
- whether a run with no jobs due avoided provider calls; and
- whether betthisguy.com itself was up. Every run first checks the home page and `/api/record`. If either still fails after one retry, the run fails and the badge turns red, GitHub emails you, and a push alert goes out if the `ALERT_NTFY_TOPIC` Actions secret is set.

For closing-line capture, open the `bet-this-guy-scheduler` Worker in the Cloudflare dashboard and check the log for each cron run. A failed capture is marked as an error there, and when the Worker's `ALERT_NTFY_TOPIC` secret is set, it also sends a push notification through [ntfy](https://ntfy.sh) to phones subscribed to that topic.

### API budget guardrails

The timer checks every five minutes, but provider calls are throttled automatically:

- During active NFL windows, the Cloudflare cron captures closing lines every five minutes, grading runs about every ten minutes and publishing runs about every fifteen minutes.
- During quiet periods, the Cloudflare cron makes no calls and most GitHub runs make zero provider calls.
- A lightweight publishing and grading checkpoint runs every six hours during quiet periods.
- Manual and workflow-change verification runs on GitHub execute all three jobs, including one closing-line capture.

The repository contains no sportsbook or stats-provider API keys. The maintenance credential is stored only as an encrypted GitHub Actions secret and a Cloudflare Worker secret.

## Partner (affiliate) links

Partner links are off until a partner approves the site. To switch them on, add a **secret** named `AFFILIATES` to the `bet-this-guy` Worker (**Settings**, then **Variables and Secrets**, type **Secret**, so deploys keep it). Its value is a JSON list of approved partners, the tracking link they gave you, and the states where their product is legal and your agreement allows promotion:

```json
[{"id":"underdog","name":"Underdog","url":"https://…your tracking link…","states":["TX","GA"]}]
```

- Links appear only inside an opened bet card, only for visitors whose connection Cloudflare places in a listed US state, and always with a commission and 21+ disclosure. The location is read per request and never stored.
- Entries without an `https` link or without states are ignored. Clicks are counted as `affiliate:click` in `usage_counts`.
- Delete the secret to switch everything off again. Check state rules with a gaming lawyer before adding sportsbooks.

## Pick alerts

The "🔔 Get pick alerts" button subscribes a browser to push notifications (standard Web Push). There is nothing to configure: on first use the Worker generates its own signing key and keeps it in the `app_settings` table.

- When the publish job posts new official picks, subscribers get one notification per 15 minutes naming the newest picks. The push carries no data; the service worker (`/sw.js`) fetches the text from `/api/alerts/latest`.
- Subscriptions live in `push_subscriptions` and are removed when a browser unsubscribes, when the push service reports them gone, or after five failed sends.
- iPhones need iOS 16.4+ and the site added to the Home Screen (the site shows those steps). `/manifest.webmanifest` and the home-screen icons make that work.

## Email alerts

Account holders can get an email when official picks post: a checkbox at sign-up (on by default) and a switch in the account panel. On iPhone, the 🔔 button offers this first, because web notifications there need the Home Screen.

- Set the `RESEND_API_KEY` secret (a Resend key with sending access for betthisguy.com). Without it nothing is sent. Optional: `EMAIL_POSTAL_ADDRESS`, a postal address for the email footer (US anti-spam law asks for one), `EMAIL_FROM` to change the sender (default `Bet This Guy <picks@betthisguy.com>`) and `EMAIL_REPLY_TO` (default `support@betthisguy.com`). Cloudflare Email Routing forwards `support@` and `picks@` to the owner's inbox.
- Every publish run checks for official picks posted since the last email whose games haven't started. One email lists them all. Emails go out at most once an hour, or every 10 minutes when one of the picks kicks off within 90 minutes.
- Opt-ins live in `email_alerts` (migration 0007). Each row has a token for the unsubscribe link and the one-click `List-Unsubscribe` header; opening the link shows a button, so link scanners can't unsubscribe anyone.
- Resend's free plan covers 100 emails a day and 3,000 a month, so upgrade before the list gets near that.

## My-book ratings and alerts

The market's fair price always comes from every sportsbook (3+ books pricing both sides, the official-pick bar). A visitor who picks their own books in Settings sees each prop priced and rated at the best of their books, so a one-book visitor still gets real Good value / Fair price / Overpriced verdicts.

On each publish run, `sendBookAlerts` (in `worker/records.js`) also tells people when one of their own books beats that fair price by 1% or more: phones with pick alerts on (their books are stored in `push_subscriptions.books_json`) and email-alert accounts with books saved in their settings. These are labelled "Not an official pick", never touch the record, skip props that are already official picks, and are capped at one message an hour and 3 props a day per person, never repeating a prop (`book_alerts` table, migration `0008`). A phone's notification text comes from `/api/alerts/latest?endpoint=…`.

## Post kit

`/post` (not linked or indexed) builds ready-to-paste posts from the official record: today's upcoming picks, this week's results so far, or last week's results. It shows editable text for X (kept under 280 characters, trimmed with a "+N more" count), Threads and Reddit (a table, with losses listed too). It also draws a 1080×1350 share image that can be shared from a phone or saved. The numbers come from the same functions as the weekly pages, at $100 a pick. Usage counts: `view:post`, `post:copy`, `post:open`, `post:image`.

## Player form (last 10 games)

Board cards show how often each bet hit in the player's last 10 games, and the prop sheet charts those games and lists every book's price. Publish runs record who is on the board and which markets they have (`player_form`, migration `0018`). Every in-between cron run, and publish runs outside NFL windows, fetch players from BALLDONTLIE in up to six parallel parts of five players, each part a separate invocation through the `SELF` binding with its own request allowance. A busy reply (429) pauses the fill until the next run. Each player is fetched again once per slate, after Tuesday and Friday 12:00 UTC. Visitors read everything from one cached `/api/form` request, so the board makes no per-card stats calls.
