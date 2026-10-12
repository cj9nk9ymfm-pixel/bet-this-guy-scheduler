-- Prediction-market picks: their own official card and record, separate from
-- the sportsbook picks. A prop qualifies when an exchange's price, after its
-- estimated fee, is 1-12 points under the sportsbooks' fair chance (3+ books).
-- odds is the listed price; net_odds the price after the fee, which grading
-- uses. close_odds is the same exchange's last price before kickoff.
CREATE TABLE IF NOT EXISTS `prediction_picks` (
	`id` text PRIMARY KEY NOT NULL,
	`exchange` text NOT NULL,
	`event_id` text NOT NULL,
	`player` text NOT NULL,
	`team` text,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`line` real NOT NULL,
	`odds` integer NOT NULL,
	`net_odds` real NOT NULL,
	`fair_pct` real NOT NULL,
	`edge` real NOT NULL,
	`game_time` text NOT NULL,
	`posted_at` text NOT NULL,
	`close_odds` integer,
	`close_at` text,
	`actual` real,
	`result` text,
	`graded_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `prediction_picks_time` ON `prediction_picks` (`game_time`);
