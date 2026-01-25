-- ============================================
-- MIGRATION: Articles - Support Traductions
-- Date: 2026-01-25
-- Description: Ajout des colonnes pour lier les versions FR/EN des articles
-- ============================================

BEGIN;

-- 1. Ajouter colonne translation_id (lien vers version traduite)
ALTER TABLE articles 
ADD COLUMN IF NOT EXISTS translation_id INT REFERENCES articles(id) ON DELETE SET NULL;

-- 2. Ajouter colonne pour tracker la méthode de traduction
ALTER TABLE articles 
ADD COLUMN IF NOT EXISTS translation_method VARCHAR(20) CHECK (translation_method IN ('manual', 'ai', NULL));

-- 3. Ajouter index pour performance
CREATE INDEX IF NOT EXISTS idx_articles_translation ON articles(translation_id);
CREATE INDEX IF NOT EXISTS idx_articles_language ON articles(language);

-- 4. Commentaires pour documentation
COMMENT ON COLUMN articles.translation_id IS 'ID de l''article traduit (NULL si pas de traduction)';
COMMENT ON COLUMN articles.translation_method IS 'Méthode de traduction: manual (manuelle), ai (DeepL), NULL (original)';

COMMIT;

-- ============================================
-- VÉRIFICATION
-- ============================================
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'articles' 
-- AND column_name IN ('translation_id', 'translation_method', 'language');
