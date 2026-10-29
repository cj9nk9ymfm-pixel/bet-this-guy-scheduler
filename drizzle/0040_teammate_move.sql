-- Teammate-out test (NBA): when a player is newly ruled Out on the night of
-- his game, each teammate's Over on points, rebounds and assists at the best
-- big-5 price, with the sportsbooks' fair chance; closing-priced and graded,
-- never posted.
CREATE TABLE IF NOT EXISTS `teammate_shadow` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`out_player` text NOT NULL,
	`out_team` text,
	`reported_at` text,
	`player` text NOT NULL,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`line` real NOT NULL,
	`odds` integer NOT NULL,
	`book` text,
	`fair` real,
	`edge` real,
	`game_time` text NOT NULL,
	`logged_at` text NOT NULL,
	`close_odds` integer,
	`close_at` text,
	`actual` real,
	`result` text,
	`graded_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `teammate_shadow_game` ON `teammate_shadow` (`game_time`);
--> statement-breakpoint
-- Market-moving test: the best big-5 price at the same line and side about an
-- hour after a sharp-shadow prop was logged (worse than ours = the market
-- moved our way).
ALTER TABLE `sharp_shadow` ADD `move_odds` integer;
--> statement-breakpoint
ALTER TABLE `sharp_shadow` ADD `move_at` text;
