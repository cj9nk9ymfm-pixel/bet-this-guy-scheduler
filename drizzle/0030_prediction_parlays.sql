-- Prediction-market parlays: 2 to 5 legs, all on one app (Kalshi, Novig,
-- ProphetX or Polymarket), built from the next tier below prediction picks
-- (0.5 to just under 1 point better than the sportsbooks' fair chance after
-- the app's fee). odds is the parlay price after fees (with the same-game cut
-- when two legs share a game); graded at a quarter unit. Own record.
CREATE TABLE IF NOT EXISTS `prediction_parlays` (
	`id` text PRIMARY KEY NOT NULL,
	`week` text NOT NULL,
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
CREATE INDEX IF NOT EXISTS `prediction_parlays_time` ON `prediction_parlays` (`game_time`);
