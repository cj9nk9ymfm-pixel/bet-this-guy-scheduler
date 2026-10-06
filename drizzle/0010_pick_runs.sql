-- One row per pick run: games and props checked, best edge, near misses
-- (0.5-1%), props that qualified and picks posted. Kept for 30 days.
CREATE TABLE IF NOT EXISTS `pick_runs` (
	`at` text PRIMARY KEY NOT NULL,
	`games` integer NOT NULL,
	`boards` integer NOT NULL,
	`failed_boards` integer NOT NULL,
	`props` integer NOT NULL,
	`best_edge` real,
	`near` integer NOT NULL,
	`qualified` integer NOT NULL,
	`capped` integer NOT NULL,
	`candidates` integer NOT NULL,
	`posted` integer NOT NULL
);
