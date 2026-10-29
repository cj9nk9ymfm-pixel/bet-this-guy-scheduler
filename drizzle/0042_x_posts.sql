-- Every post we send to X (logged by xPost), and its public metrics read once
-- a day after it's about a day old (xMetricsDaily): one X read for up to 100 posts.
CREATE TABLE IF NOT EXISTS `x_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text,
	`text` text,
	`reply_to` text,
	`quote_of` text,
	`media` integer,
	`poll` integer,
	`posted_at` text NOT NULL,
	`impressions` integer,
	`likes` integer,
	`replies` integer,
	`reposts` integer,
	`quotes` integer,
	`bookmarks` integer,
	`metrics_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `x_posts_at` ON `x_posts` (`posted_at`);
