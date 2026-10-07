-- Players a phone follows, for "good value on players you follow" alerts.
ALTER TABLE `push_subscriptions` ADD `follows_json` text;
