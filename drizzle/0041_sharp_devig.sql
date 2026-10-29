-- Deep-audit shadow columns (Oct 29). fair_power / fair_shin: the side's fair
-- chance with the power and Shin de-vig instead of the plain average.
-- close_fair: the books' fair chance at the same line at tip-off (CLV against
-- the fair price). pin_first / pin_close: the sharp book's first fair chance
-- and its last one inside an hour of tip-off (CLV against the sharp close).
ALTER TABLE `sharp_shadow` ADD `fair_power` real;
--> statement-breakpoint
ALTER TABLE `sharp_shadow` ADD `fair_shin` real;
--> statement-breakpoint
ALTER TABLE `sharp_shadow` ADD `close_fair` real;
--> statement-breakpoint
ALTER TABLE `sharp_shadow` ADD `pin_first` real;
--> statement-breakpoint
ALTER TABLE `sharp_shadow` ADD `pin_close` real;
--> statement-breakpoint
ALTER TABLE `sharp_shadow` ADD `pin_close_at` text;
