-- NBA picks in shadow mode: what the official rules would have locked (never
-- posted), the closing big-5 price at the same line, and the graded result.
CREATE TABLE IF NOT EXISTS `nba_shadow` (
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
	`close_odds` integer,
	`close_at` text,
	`actual` real,
	`result` text,
	`graded_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `nba_shadow_game` ON `nba_shadow` (`game_time`);
