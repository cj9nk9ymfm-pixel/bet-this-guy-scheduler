-- NFL injury report (ESPN), replaced on each refresh: Out, Doubtful,
-- Questionable, Injured Reserve and so on. Board cards show the status; the
-- pick job skips players listed Out or Doubtful.
CREATE TABLE IF NOT EXISTS `injuries` (
	`id` text PRIMARY KEY NOT NULL,
	`player` text NOT NULL,
	`team` text,
	`position` text,
	`status` text NOT NULL,
	`detail` text,
	`reported_at` text,
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
-- Usage-bump test (shadow): when a receiver or running back is out, his
-- teammates at the same position, Over their main receptions / receiving
-- yards (or rushing yards / attempts), at the best big-5 price, logged about
-- 90 minutes before kickoff. Never posted.
CREATE TABLE IF NOT EXISTS `bump_shadow` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`player` text NOT NULL,
	`team` text,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`line` real NOT NULL,
	`odds` integer NOT NULL,
	`book` text NOT NULL,
	`trigger_player` text NOT NULL,
	`trigger_status` text NOT NULL,
	`game_time` text NOT NULL,
	`logged_at` text NOT NULL,
	`close_odds` integer,
	`actual` real,
	`result` text,
	`graded_at` text
);
--> statement-breakpoint
-- Player form now keeps each player's own team and position (for teammates).
ALTER TABLE `player_form` ADD COLUMN `team` text;
--> statement-breakpoint
ALTER TABLE `player_form` ADD COLUMN `position` text;
--> statement-breakpoint
UPDATE `player_form` SET `fetched_at` = NULL;
