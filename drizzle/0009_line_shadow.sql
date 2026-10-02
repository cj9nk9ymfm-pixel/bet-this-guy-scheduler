-- Line value in shadow mode: would-be picks rated on the fair-price curve,
-- logged (never posted) and compared with the last fair price before kickoff.
CREATE TABLE IF NOT EXISTS `line_shadow` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`player` text NOT NULL,
	`market_key` text NOT NULL,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`line` real NOT NULL,
	`odds` integer NOT NULL,
	`book` text NOT NULL,
	`alt` integer NOT NULL,
	`main_line` real NOT NULL,
	`books` integer NOT NULL,
	`edge` real NOT NULL,
	`fair` real NOT NULL,
	`game_time` text NOT NULL,
	`logged_at` text NOT NULL,
	`model_json` text NOT NULL,
	`close_fair` real,
	`close_main` real,
	`close_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `line_shadow_game` ON `line_shadow` (`game_time`);
