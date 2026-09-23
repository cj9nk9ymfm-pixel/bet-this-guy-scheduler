CREATE TABLE `user_bet_legs` (
	`id` text PRIMARY KEY NOT NULL,
	`bet_id` text NOT NULL,
	`auth_user_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`event_id` text,
	`player` text NOT NULL,
	`team` text,
	`opponent` text,
	`market` text NOT NULL,
	`side` text NOT NULL,
	`line` text,
	`american_odds` integer NOT NULL,
	`game_start` text,
	`actual_value` text,
	`result` text DEFAULT 'pending' NOT NULL,
	`grading_note` text,
	`snapshot_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`bet_id`) REFERENCES `user_bets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user_profiles`(`auth_user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_bet_legs_result_check" CHECK("user_bet_legs"."result" in ('pending','won','lost','push','void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_bet_legs_bet_ordinal` ON `user_bet_legs` (`bet_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `user_bet_legs_user_game` ON `user_bet_legs` (`auth_user_id`,`game_start`);--> statement-breakpoint
CREATE TABLE `user_bets` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`bet_type` text NOT NULL,
	`source` text DEFAULT 'board' NOT NULL,
	`title` text,
	`sportsbook` text,
	`stake_cents` integer NOT NULL,
	`american_odds` integer NOT NULL,
	`potential_payout_cents` integer NOT NULL,
	`profit_loss_cents` integer,
	`game_start` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text DEFAULT 'pending' NOT NULL,
	`verification_status` text DEFAULT 'timestamped' NOT NULL,
	`snapshot_json` text DEFAULT '{}' NOT NULL,
	`locked_at` text,
	`graded_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user_profiles`(`auth_user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_bets_type_check" CHECK("user_bets"."bet_type" in ('single','parlay')),
	CONSTRAINT "user_bets_source_check" CHECK("user_bets"."source" in ('board','manual','imported')),
	CONSTRAINT "user_bets_status_check" CHECK("user_bets"."status" in ('pending','provisional','final')),
	CONSTRAINT "user_bets_result_check" CHECK("user_bets"."result" in ('pending','won','lost','push','void'))
);
--> statement-breakpoint
CREATE INDEX `user_bets_user_created` ON `user_bets` (`auth_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `user_bets_user_status` ON `user_bets` (`auth_user_id`,`status`,`game_start`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`auth_user_id` text PRIMARY KEY NOT NULL,
	`preferences_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user_profiles`(`auth_user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`auth_user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`subscription_status` text DEFAULT 'inactive' NOT NULL,
	`entitlement_expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "user_profiles_plan_check" CHECK("user_profiles"."plan" in ('free','premium','admin')),
	CONSTRAINT "user_profiles_subscription_check" CHECK("user_profiles"."subscription_status" in ('inactive','trialing','active','past_due','canceled'))
);
--> statement-breakpoint
CREATE TABLE `user_saved_items` (
	`id` text PRIMARY KEY NOT NULL,
	`auth_user_id` text NOT NULL,
	`item_type` text NOT NULL,
	`fingerprint` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user_profiles`(`auth_user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_saved_items_type_check" CHECK("user_saved_items"."item_type" in ('prop','parlay'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_saved_items_user_fingerprint` ON `user_saved_items` (`auth_user_id`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `user_saved_items_user_created` ON `user_saved_items` (`auth_user_id`,`created_at`);
