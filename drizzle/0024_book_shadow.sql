-- Props the 3-book rule skips, in shadow mode. kind='two_book': exactly two
-- books price both sides and the better one is 1%+ past their average.
-- kind='defense': sacks and tackles (usually one book) priced against the
-- player's last 10 games, blended with the book's own no-vig price. Logged
-- once per player and game, tracked to kickoff, graded; never posted.
CREATE TABLE IF NOT EXISTS `book_shadow` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`event_id` text NOT NULL,
	`player` text NOT NULL,
	`team` text,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`line` real NOT NULL,
	`odds` integer NOT NULL,
	`book` text NOT NULL,
	`edge` real NOT NULL,
	`detail` text,
	`game_time` text NOT NULL,
	`logged_at` text NOT NULL,
	`close_odds` integer,
	`close_at` text,
	`actual` real,
	`result` text,
	`graded_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `book_shadow_time` ON `book_shadow` (`kind`,`game_time`);
