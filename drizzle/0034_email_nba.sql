-- Whether an email-alerts account also gets official NBA pick emails. On by
-- default, like phone alerts; the account panel turns it off.
ALTER TABLE `email_alerts` ADD `nba` integer DEFAULT 1 NOT NULL;
