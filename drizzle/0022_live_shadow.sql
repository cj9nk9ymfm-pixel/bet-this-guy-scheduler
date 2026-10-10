-- Live props in shadow mode. At the end of the 1st quarter and at halftime of
-- each game: a player well behind his pregame line's pace (slow start) is
-- logged Over his live line, one well ahead (hot start) Under it, at the best
-- big-5 live price. expected_final = stat so far + the rest of the game at
-- the pregame line's rate; gap = how far that expectation is past the live
-- line on the logged side. Graded at the final; never posted.
CREATE TABLE IF NOT EXISTS `live_shadow` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`player` text NOT NULL,
	`market` text NOT NULL,
	`checkpoint` text NOT NULL,
	`elapsed` real NOT NULL,
	`stat_at` real NOT NULL,
	`targets` real,
	`pregame_line` real NOT NULL,
	`live_line` real NOT NULL,
	`side` text NOT NULL,
	`odds` integer NOT NULL,
	`book` text NOT NULL,
	`expected_final` real NOT NULL,
	`gap` real NOT NULL,
	`pace` text NOT NULL,
	`score` text,
	`team` text,
	`game_time` text NOT NULL,
	`logged_at` text NOT NULL,
	`actual` real,
	`result` text,
	`graded_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `live_shadow_game` ON `live_shadow` (`game_time`);
