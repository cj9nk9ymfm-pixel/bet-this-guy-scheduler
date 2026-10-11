-- Prediction markets (Kalshi, Polymarket, Novig, ProphetX, BetOpenly via The
-- Odds API's us_ex region) in shadow mode: an exchange price that beats our
-- sportsbook fair price by 1%+ is logged once per game and prop (or game
-- market), tracked to kickoff and graded. Prices are as listed, before any
-- exchange fee. Never posted.
CREATE TABLE IF NOT EXISTS `exchange_shadow` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`exchange` text NOT NULL,
	`event_id` text NOT NULL,
	`home` text,
	`away` text,
	`player` text,
	`team` text,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`line` real,
	`odds` integer NOT NULL,
	`fair_pct` real NOT NULL,
	`edge` real NOT NULL,
	`game_time` text NOT NULL,
	`logged_at` text NOT NULL,
	`close_odds` integer,
	`close_at` text,
	`actual` real,
	`home_score` integer,
	`away_score` integer,
	`result` text,
	`graded_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `exchange_shadow_time` ON `exchange_shadow` (`game_time`);
