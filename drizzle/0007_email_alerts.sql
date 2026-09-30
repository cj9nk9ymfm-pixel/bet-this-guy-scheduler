CREATE TABLE IF NOT EXISTS `email_alerts` (
	`auth_user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`token` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`auth_user_id`) REFERENCES `user_profiles`(`auth_user_id`) ON UPDATE no action ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS `email_alerts_token` ON `email_alerts` (`token`);
