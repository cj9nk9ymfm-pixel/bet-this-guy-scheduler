-- Game lines in shadow mode: moneylines, spreads and totals priced with the
-- same multi-book fair-price method as props. A side at least 1% better than
-- fair at a big-5 book is logged once per game and market, tracked to kickoff
-- and graded from the final score. Never posted.
CREATE TABLE IF NOT EXISTS `game_shadow` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`home` text NOT NULL,
	`away` text NOT NULL,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`line` real,
	`odds` integer NOT NULL,
	`book` text NOT NULL,
	`edge` real NOT NULL,
	`game_time` text NOT NULL,
	`logged_at` text NOT NULL,
	`close_odds` integer,
	`close_at` text,
	`home_score` integer,
	`away_score` integer,
	`result` text,
	`graded_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `game_shadow_time` ON `game_shadow` (`game_time`);
--> statement-breakpoint
-- Forecast at each outdoor game's stadium, refreshed every two hours until
-- kickoff (kept afterwards so tests can be split by weather later).
CREATE TABLE IF NOT EXISTS `game_weather` (
	`event_id` text PRIMARY KEY NOT NULL,
	`stadium` text NOT NULL,
	`game_time` text NOT NULL,
	`temp_f` real,
	`wind_mph` real,
	`gust_mph` real,
	`precip_pct` real,
	`fetched_at` integer NOT NULL
);
