-- Which picks a phone is pinged for: sportsbook picks and/or prediction app
-- picks. Existing phones keep what they got: sportsbook picks, plus
-- prediction picks for phones on the prediction view.
ALTER TABLE `push_subscriptions` ADD `alert_sportsbook` integer DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `alert_predictions` integer DEFAULT 0;
--> statement-breakpoint
UPDATE `push_subscriptions` SET `alert_predictions` = 1 WHERE `price_view` = 'predictions';
