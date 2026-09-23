ALTER TABLE public_recommendations ADD COLUMN source TEXT DEFAULT 'official';
ALTER TABLE public_recommendations ADD COLUMN verification_note TEXT;
