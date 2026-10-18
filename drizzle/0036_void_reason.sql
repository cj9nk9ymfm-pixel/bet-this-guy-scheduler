-- Why a prediction pick was voided, such as "Ruled out (Groin)" when the
-- player was ruled out before kickoff.
ALTER TABLE `prediction_picks` ADD `void_reason` text;
