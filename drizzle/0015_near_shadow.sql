-- Near-miss picks in shadow mode: props that pass every official rule except
-- the edge (0.5% to just under 1%). Logged once per player and game, never
-- posted; the closing big-5 price and the graded result show whether a lower
-- bar would have paid.
CREATE TABLE IF NOT EXISTS `near_shadow` (
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
CREATE INDEX IF NOT EXISTS `near_shadow_game` ON `near_shadow` (`game_time`);
