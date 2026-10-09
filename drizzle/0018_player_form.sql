-- Player form: each board player's last 10 games, so prop cards can show how
-- often the bet would have hit. Publish runs list who's on the board and which
-- markets they have (wanted_until = their next kickoff); quiet cron runs fetch
-- a few players at a time from the stats feed.
CREATE TABLE IF NOT EXISTS `player_form` (
	`id` text PRIMARY KEY NOT NULL,
	`sport` text NOT NULL,
	`player` text NOT NULL,
	`teams` text,
	`markets` text NOT NULL,
	`wanted_until` text NOT NULL,
	`games_json` text,
	`fetched_at` integer,
	`failures` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `player_form_wanted` ON `player_form` (`wanted_until`);
