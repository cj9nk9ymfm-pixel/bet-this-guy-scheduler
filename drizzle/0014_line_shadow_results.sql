-- Grade line-value shadow picks like official ones: the game (for box-score
-- lookups) and the result once it's final.
ALTER TABLE `line_shadow` ADD `team` text;
--> statement-breakpoint
ALTER TABLE `line_shadow` ADD `actual` real;
--> statement-breakpoint
ALTER TABLE `line_shadow` ADD `result` text;
--> statement-breakpoint
ALTER TABLE `line_shadow` ADD `graded_at` text;
