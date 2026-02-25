-- ============================================================
-- Migration 003 : Ajout de la colonne read_time aux articles
-- Stocke le temps de lecture estimé (en minutes, min 1)
-- Calcul : nb_mots / 230 (vitesse de lecture adulte moyenne)
-- ============================================================

-- 1. Ajout de la colonne (si elle n'existe pas déjà)
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS read_time INTEGER NOT NULL DEFAULT 1;

-- 2. Rétro-calcul immédiat sur tous les articles existants
--    regexp_split_to_array() compte les mots en splitant sur les espaces/retours
--    GREATEST(..., 1) garantit un minimum de 1 minute
UPDATE articles
SET read_time = GREATEST(
  CEIL(
    array_length(
      regexp_split_to_array(TRIM(content), '\s+'),
      1
    )::numeric / 230
  )::integer,
  1
)
WHERE content IS NOT NULL AND TRIM(content) <> '';

-- Vérification rapide
SELECT
  COUNT(*) AS total_articles,
  MIN(read_time) AS min_min,
  MAX(read_time) AS max_min,
  ROUND(AVG(read_time), 1) AS avg_min
FROM articles;
