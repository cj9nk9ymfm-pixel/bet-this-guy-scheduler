CREATE TABLE `movement_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`captured_at` integer NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `movement_event_time` ON `movement_snapshots` (`event_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `movement_expiry` ON `movement_snapshots` (`captured_at`);
