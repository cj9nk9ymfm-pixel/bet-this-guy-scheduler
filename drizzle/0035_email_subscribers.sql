-- Email alerts without an account: an address, confirmed by a link, with
-- the same NBA and prediction-pick choices as account emails. status is
-- pending until the link is opened, active after, off once unsubscribed.
CREATE TABLE IF NOT EXISTS `email_subscribers` (
	`email` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`nba` integer DEFAULT 1 NOT NULL,
	`predictions` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`confirm_sent_at` text,
	`confirmed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `email_subscribers_token` ON `email_subscribers` (`token`);
