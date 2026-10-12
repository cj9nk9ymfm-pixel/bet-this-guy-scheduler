-- "Also email prediction market picks": account holders who also want an
-- email when a prediction-market pick posts (off by default).
ALTER TABLE `email_alerts` ADD `predictions` integer DEFAULT 0 NOT NULL;
