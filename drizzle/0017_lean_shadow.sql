-- Game leans in shadow mode: one per game, the best-rated prop at the big-5
-- books priced -150 to +150, locked about 90 minutes before kickoff (or, for
-- the Week 5 backtest, from the saved odds snapshot an hour before kickoff).
-- Never posted and never in the official record; graded to decide whether a
-- pick for every game can hold up.
CREATE TABLE IF NOT EXISTS `lean_shadow` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`player` text NOT NULL,
	`team` text,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`line` real NOT NULL,
	`odds` integer NOT NULL,
	`book` text NOT NULL,
	`edge` real NOT NULL,
	`game_time` text NOT NULL,
	`logged_at` text NOT NULL,
	`source` text NOT NULL,
	`close_odds` integer,
	`close_at` text,
	`actual` real,
	`result` text,
	`graded_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `lean_shadow_game` ON `lean_shadow` (`game_time`);
