CREATE TABLE IF NOT EXISTS public_recommendations (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT 'NFL',
  player TEXT,
  market TEXT,
  side TEXT,
  line REAL,
  odds INTEGER,
  combined_odds INTEGER,
  edge REAL,
  game_id TEXT,
  game_time TEXT,
  legs_json TEXT NOT NULL DEFAULT '[]',
  posted_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_public_recommendations_status ON public_recommendations(status, posted_at);
CREATE INDEX IF NOT EXISTS idx_public_recommendations_kind ON public_recommendations(kind, status);
CREATE INDEX IF NOT EXISTS idx_public_recommendations_game ON public_recommendations(game_id, game_time);
