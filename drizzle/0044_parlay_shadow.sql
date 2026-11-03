-- Parlay shadow test (Nov 3): one never-posted 2-4 leg parlay per strategy per
-- slate (NBA night / NFL Eastern day), picked about an hour before the slate's
-- first game from the sharp-test candidates (sharp_shadow ids in legs_json),
-- graded from those legs' results.
CREATE TABLE IF NOT EXISTS `parlay_shadow` (
	`id` text PRIMARY KEY NOT NULL,
	`sport` text NOT NULL,
	`slate` text NOT NULL,
	`strategy` text NOT NULL,
	`legs_json` text NOT NULL,
	`decimal` real NOT NULL,
	`picked_at` text NOT NULL,
	`game_time` text NOT NULL,
	`result` text,
	`payout` real,
	`graded_at` text
);
