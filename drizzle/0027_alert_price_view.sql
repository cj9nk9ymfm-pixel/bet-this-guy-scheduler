-- How a phone wants pick alerts priced: 'odds' (sportsbooks, the default) or
-- 'predictions' (prediction-market chances), and the state it bets from
-- (picked or detected on the site; decides which prediction markets apply).
ALTER TABLE `push_subscriptions` ADD `price_view` text;
--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `state` text;
