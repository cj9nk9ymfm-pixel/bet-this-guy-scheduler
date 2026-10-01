ALTER TABLE `push_subscriptions` ADD `books_json` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `book_alerts` (
	`recipient` text NOT NULL,
	`prop_key` text NOT NULL,
	`sent_at` text NOT NULL,
	`message_json` text NOT NULL,
	PRIMARY KEY(`recipient`, `prop_key`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `book_alerts_recent` ON `book_alerts` (`recipient`,`sent_at`);
