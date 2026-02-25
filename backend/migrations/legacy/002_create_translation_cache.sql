
BEGIN;

-- Table de cache des traductions
CREATE TABLE IF NOT EXISTS translations (
  id SERIAL PRIMARY KEY,
  original_hash VARCHAR(64) NOT NULL,
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_lang VARCHAR(10) NOT NULL,
  target_lang VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_translation UNIQUE (original_hash, target_lang)
);

-- Index pour recherche rapide par hash
CREATE INDEX IF NOT EXISTS idx_translations_hash ON translations(original_hash);

-- Table de suivi usage DeepL
CREATE TABLE IF NOT EXISTS deepl_usage (
  id SERIAL PRIMARY KEY,
  month VARCHAR(7) NOT NULL UNIQUE, -- Format 'YYYY-MM'
  characters_count INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMIT;
