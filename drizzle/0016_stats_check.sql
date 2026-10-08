-- Stats check in shadow mode. defense_games: what each defense allowed to
-- each position in one game (stat totals, summed over the players).
-- stats_checks: a projection for each official pick and near miss from the
-- player's recent games and the opponent's defense, and whether it agreed
-- with our side. Never changes a pick; results come from the pick tables.
CREATE TABLE IF NOT EXISTS `defense_games` (
	`game_id` text NOT NULL,
	`defense` text NOT NULL,
	`position` text NOT NULL,
	`game_date` text NOT NULL,
	`stats_json` text NOT NULL,
	PRIMARY KEY (`game_id`, `defense`, `position`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `defense_games_pos` ON `defense_games` (`position`, `game_date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stats_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`player` text NOT NULL,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`line` real NOT NULL,
	`game_time` text NOT NULL,
	`opponent` text,
	`position` text,
	`games` integer NOT NULL,
	`l5_avg` real,
	`l10_avg` real,
	`season_avg` real,
	`l10_hits` integer,
	`def_factor` real,
	`def_games` integer,
	`projection` real,
	`lean` real,
	`verdict` text NOT NULL,
	`detail_json` text NOT NULL,
	`checked_at` text NOT NULL
);
