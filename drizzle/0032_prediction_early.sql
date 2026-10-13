-- 1 when a prediction pick was decided while its game was still on (an Over
-- that already cleared its line, or an Under it already passed).
ALTER TABLE `prediction_picks` ADD `early` integer;
