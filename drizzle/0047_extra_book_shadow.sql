-- Extra-books test (Nov 25, Tim: "shadow test everything they offer and see if it does better or
-- worse"): books and apps our odds provider has that we don't use. kind 'venue': a price at that
-- book that beats our fair price (from the licensed books). kind 'fair': a pick that would be added
-- or dropped if that book were part of the fair price. Graded from the box score; never posted.
CREATE TABLE IF NOT EXISTS `extra_book_shadow` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`sport` text NOT NULL,
	`event_id` text NOT NULL,
	`matchup` text,
	`player` text NOT NULL,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`line` real NOT NULL,
	`book` text NOT NULL,
	`book_title` text,
	`odds` integer NOT NULL,
	`fair` real,
	`edge` real,
	`fair_with` real,
	`edge_with` real,
	`change` text,
	`game_time` text NOT NULL,
	`logged_at` text NOT NULL,
	`actual` real,
	`result` text,
	`graded_at` text
);
