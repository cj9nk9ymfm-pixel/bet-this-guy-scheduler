-- Whether a phone is pinged for official NBA picks. On for every phone,
-- including those subscribed before NBA launched; Settings turns it off.
ALTER TABLE `push_subscriptions` ADD `alert_nba` integer DEFAULT 1;
