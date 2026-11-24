-- X following cleanup (Nov 24, Tim): who @BetThisGuy follows, the verdict on each
-- (keep or cut, and why), and when it was unfollowed. x_followers holds who follows us.
CREATE TABLE IF NOT EXISTS `x_following` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`name` text,
	`description` text,
	`followers` integer,
	`tweets` integer,
	`last_post` text,
	`default_photo` integer DEFAULT 0 NOT NULL,
	`follows_back` integer DEFAULT 0 NOT NULL,
	`verdict` text,
	`reason` text,
	`status` text,
	`scanned_at` text NOT NULL,
	`unfollowed_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `x_followers` (
	`id` text PRIMARY KEY NOT NULL,
	`scanned_at` text NOT NULL
);
