-- Migration: Ajout des colonnes analytics manquantes
-- Date: 2026-01-23
-- Description: Ajoute les colonnes de tracking de lecture si elles n'existent pas

-- Vérifier et ajouter les colonnes une par une
DO $$ 
BEGIN
    -- reads_start
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='article_analytics' AND column_name='reads_start') THEN
        ALTER TABLE article_analytics ADD COLUMN reads_start INTEGER DEFAULT 0;
    END IF;

    -- reads_25
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='article_analytics' AND column_name='reads_25') THEN
        ALTER TABLE article_analytics ADD COLUMN reads_25 INTEGER DEFAULT 0;
    END IF;

    -- reads_50
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='article_analytics' AND column_name='reads_50') THEN
        ALTER TABLE article_analytics ADD COLUMN reads_50 INTEGER DEFAULT 0;
    END IF;

    -- reads_75
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='article_analytics' AND column_name='reads_75') THEN
        ALTER TABLE article_analytics ADD COLUMN reads_75 INTEGER DEFAULT 0;
    END IF;

    -- reads_100
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='article_analytics' AND column_name='reads_100') THEN
        ALTER TABLE article_analytics ADD COLUMN reads_100 INTEGER DEFAULT 0;
    END IF;

    -- updated_at
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='article_analytics' AND column_name='updated_at') THEN
        ALTER TABLE article_analytics ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    END IF;
END $$;

-- Afficher la structure finale
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'article_analytics'
ORDER BY ordinal_position;
