-- "My books" for email sign-ups (Nov 25, Tim): the sportsbooks a subscriber uses (a JSON list of
-- names). Their pick emails list picks at those books first.
ALTER TABLE `email_subscribers` ADD COLUMN `books` text;
