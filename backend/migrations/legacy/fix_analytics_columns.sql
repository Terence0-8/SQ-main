-- ═══════════════════════════════════════════════════════════
-- MIGRATION CORRIGÉE: Analytics sur table ARTICLES
-- Date: 2026-01-23 21:05 CET
-- Description: Ajout des colonnes de tracking dans la table articles
-- ═══════════════════════════════════════════════════════════

-- Vérifier et ajouter les colonnes une par une
DO $$ 
BEGIN
    -- reads_start (nombre de fois qu'un article a été ouvert)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='articles' AND column_name='reads_start') THEN
        ALTER TABLE articles ADD COLUMN reads_start INTEGER DEFAULT 0;
        RAISE NOTICE 'Colonne reads_start ajoutée';
    ELSE
        RAISE NOTICE 'Colonne reads_start existe déjà';
    END IF;

    -- reads_25 (nombre de lectures à 25%)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='articles' AND column_name='reads_25') THEN
        ALTER TABLE articles ADD COLUMN reads_25 INTEGER DEFAULT 0;
        RAISE NOTICE 'Colonne reads_25 ajoutée';
    ELSE
        RAISE NOTICE 'Colonne reads_25 existe déjà';
    END IF;

    -- reads_50 (nombre de lectures à 50%)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='articles' AND column_name='reads_50') THEN
        ALTER TABLE articles ADD COLUMN reads_50 INTEGER DEFAULT 0;
        RAISE NOTICE 'Colonne reads_50 ajoutée';
    ELSE
        RAISE NOTICE 'Colonne reads_50 existe déjà';
    END IF;

    -- reads_75 (nombre de lectures à 75%)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='articles' AND column_name='reads_75') THEN
        ALTER TABLE articles ADD COLUMN reads_75 INTEGER DEFAULT 0;
        RAISE NOTICE 'Colonne reads_75 ajoutée';
    ELSE
        RAISE NOTICE 'Colonne reads_75 existe déjà';
    END IF;

    -- reads_100 (nombre de lectures complètes)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='articles' AND column_name='reads_100') THEN
        ALTER TABLE articles ADD COLUMN reads_100 INTEGER DEFAULT 0;
        RAISE NOTICE 'Colonne reads_100 ajoutée';
    ELSE
        RAISE NOTICE 'Colonne reads_100 existe déjà';
    END IF;

END $$;

-- Afficher la structure finale pour vérification
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'articles'
  AND column_name LIKE 'reads%'
ORDER BY column_name;

-- Message de confirmation
DO $$
BEGIN
    RAISE NOTICE '✅ Migration analytics terminée ! Les colonnes sont prêtes pour le tracking.';
END $$;