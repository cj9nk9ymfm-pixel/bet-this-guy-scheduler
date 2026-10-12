-- Latest prediction-market (exchange) prices for each upcoming NFL game,
-- saved by the exchange job every 30 minutes as one JSON list per game:
-- [[exchangeKey, player, market, side, line, odds], ...]. Read by
-- /api/predictions to show prices on picks for the visitor's state.
CREATE TABLE IF NOT EXISTS `exchange_prices` (
	`event_id` text PRIMARY KEY NOT NULL,
	`game_time` text NOT NULL,
	`prices_json` text NOT NULL,
	`updated_at` text NOT NULL
);
