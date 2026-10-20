-- NBA prediction-app parlays, tracked privately (never shown on the site)
-- to see how they would do before any go public.
CREATE TABLE IF NOT EXISTS `nba_pm_parlays` (
	`id` text PRIMARY KEY NOT NULL,
	`night` text NOT NULL,
	`tier` text NOT NULL,
	`exchange` text NOT NULL,
	`legs_json` text NOT NULL,
	`odds` integer NOT NULL,
	`game_time` text NOT NULL,
	`posted_at` text NOT NULL,
	`result` text,
	`graded_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `nba_pm_parlays_night` ON `nba_pm_parlays` (`night`);
