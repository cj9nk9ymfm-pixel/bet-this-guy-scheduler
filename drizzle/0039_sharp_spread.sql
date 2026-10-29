-- Blowout check: Pinnacle's pregame spread (home team) beside each sharp-shadow
-- prop, and once graded the final margin from the player's team's side
-- (negative = his team lost) and whether his team was home.
ALTER TABLE `sharp_shadow` ADD `pin_spread` real;
--> statement-breakpoint
ALTER TABLE `sharp_shadow` ADD `final_margin` real;
--> statement-breakpoint
ALTER TABLE `sharp_shadow` ADD `player_home` integer;
