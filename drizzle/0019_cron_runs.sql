-- One row per cron run: which jobs were due, when it started and finished,
-- and each job's outcome. A row with no ended_at means the run was cut off
-- (CPU or request limits) before it finished. Kept for three days.
CREATE TABLE IF NOT EXISTS `cron_runs` (
	`at` text PRIMARY KEY NOT NULL,
	`jobs` text NOT NULL,
	`ended_at` text,
	`results_json` text
);
