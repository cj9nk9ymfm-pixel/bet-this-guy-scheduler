ALTER TABLE public_recommendations ADD COLUMN closing_line REAL;
ALTER TABLE public_recommendations ADD COLUMN closing_odds INTEGER;
ALTER TABLE public_recommendations ADD COLUMN closing_captured_at TEXT;
CREATE INDEX IF NOT EXISTS idx_public_recommendations_game ON public_recommendations(game_id, game_time);
