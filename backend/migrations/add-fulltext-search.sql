-- ============================================================
-- MIGRATION : Full-Text Search PostgreSQL (tsvector + GIN)
-- À exécuter UNE SEULE FOIS sur la base de données
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │  ARTICLES                                               │
-- └─────────────────────────────────────────────────────────┘

-- 1. Ajouter la colonne tsvector sur articles
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Remplir la colonne avec un vecteur combinant titre (poids A = important)
--    et contenu/excerpt (poids B)
UPDATE articles
SET search_vector =
  setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('french', coalesce(excerpt, '')), 'B') ||
  setweight(to_tsvector('french', coalesce(content, '')), 'C');

-- 3. Créer l'index GIN (optimisé pour la recherche plein texte)
CREATE INDEX IF NOT EXISTS idx_articles_search
  ON articles USING GIN (search_vector);

-- 4. Trigger : maintenir search_vector à jour automatiquement
CREATE OR REPLACE FUNCTION articles_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(NEW.excerpt, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(NEW.content, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_articles_search ON articles;
CREATE TRIGGER trig_articles_search
  BEFORE INSERT OR UPDATE OF title, excerpt, content
  ON articles
  FOR EACH ROW EXECUTE FUNCTION articles_search_vector_update();


-- ┌─────────────────────────────────────────────────────────┐
-- │  PODCASTS                                               │
-- └─────────────────────────────────────────────────────────┘

ALTER TABLE podcasts
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

UPDATE podcasts
SET search_vector =
  setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('french', coalesce(description, '')), 'B');

CREATE INDEX IF NOT EXISTS idx_podcasts_search
  ON podcasts USING GIN (search_vector);

CREATE OR REPLACE FUNCTION podcasts_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_podcasts_search ON podcasts;
CREATE TRIGGER trig_podcasts_search
  BEFORE INSERT OR UPDATE OF title, description
  ON podcasts
  FOR EACH ROW EXECUTE FUNCTION podcasts_search_vector_update();


-- ┌─────────────────────────────────────────────────────────┐
-- │  EMISSIONS                                              │
-- └─────────────────────────────────────────────────────────┘

ALTER TABLE emissions
  ADD COLUMN IF NOT EXISTS search_vector tsvector;

UPDATE emissions
SET search_vector =
  setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('french', coalesce(description, '')), 'B');

CREATE INDEX IF NOT EXISTS idx_emissions_search
  ON emissions USING GIN (search_vector);

CREATE OR REPLACE FUNCTION emissions_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_emissions_search ON emissions;
CREATE TRIGGER trig_emissions_search
  BEFORE INSERT OR UPDATE OF title, description
  ON emissions
  FOR EACH ROW EXECUTE FUNCTION emissions_search_vector_update();

-- ============================================================
-- FIN DE MIGRATION
-- ============================================================
