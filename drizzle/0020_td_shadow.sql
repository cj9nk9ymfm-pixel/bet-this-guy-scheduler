-- Touchdown props in shadow mode. Books only post the "Yes" side of anytime
-- and first-touchdown props, so the usual fair price (both sides at 3+ books)
-- never rates them. Here each prop is compared with the consensus across
-- books: gap = how much better the best big-5 price is than the average.
-- Logged about 90 minutes before kickoff (or, for the Week 5 backtest, from
-- the saved odds an hour before kickoff); never posted; graded from the box
-- score and play-by-play.
CREATE TABLE IF NOT EXISTS `td_shadow` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`player` text NOT NULL,
	`team` text,
	`market` text NOT NULL,
	`odds` integer NOT NULL,
	`book` text NOT NULL,
	`books` integer NOT NULL,
	`avg_odds` integer NOT NULL,
	`gap` real NOT NULL,
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
CREATE INDEX IF NOT EXISTS `td_shadow_game` ON `td_shadow` (`game_time`);
