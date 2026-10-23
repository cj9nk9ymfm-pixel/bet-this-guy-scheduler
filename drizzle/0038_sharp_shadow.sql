-- Sharp-book shadow: props our engine rates 0.25%+ inside 24 hours of the
-- game, with Pinnacle's no-vig fair chance beside our 5-book one. Graded and
-- closing-priced like the other shadow tests; never posted.
CREATE TABLE IF NOT EXISTS `sharp_shadow` (
	`id` text PRIMARY KEY NOT NULL,
	`sport` text NOT NULL,
	`event_id` text NOT NULL,
	`player` text NOT NULL,
	`team` text,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`line` real NOT NULL,
	`odds` integer NOT NULL,
	`book` text,
	`edge` real NOT NULL,
	`pin_fair` real,
	`pin_edge` real,
	`pin_at` text,
	`game_time` text NOT NULL,
	`logged_at` text NOT NULL,
	`close_odds` integer,
	`close_at` text,
	`actual` real,
	`result` text,
	`graded_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sharp_shadow_game` ON `sharp_shadow` (`game_time`);
