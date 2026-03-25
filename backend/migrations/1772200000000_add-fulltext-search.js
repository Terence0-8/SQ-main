// Full-Text Search : colonnes tsvector + index GIN + triggers
// Idempotent — peut tourner sur une DB qui a déjà les colonnes (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE)

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ── ARTICLES ──────────────────────────────────────────────────
  pgm.sql(`ALTER TABLE articles ADD COLUMN IF NOT EXISTS search_vector tsvector`);
  pgm.sql(`UPDATE articles SET search_vector =
    setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(excerpt, '')), 'B') ||
    setweight(to_tsvector('french', coalesce(content, '')), 'C')
    WHERE search_vector IS NULL`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_articles_search ON articles USING GIN (search_vector)`);
  pgm.sql(`CREATE OR REPLACE FUNCTION articles_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('french', coalesce(NEW.excerpt, '')), 'B') ||
        setweight(to_tsvector('french', coalesce(NEW.content, '')), 'C');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`);
  pgm.sql(`DROP TRIGGER IF EXISTS trig_articles_search ON articles`);
  pgm.sql(`CREATE TRIGGER trig_articles_search
    BEFORE INSERT OR UPDATE OF title, excerpt, content ON articles
    FOR EACH ROW EXECUTE FUNCTION articles_search_vector_update()`);

  // ── PODCASTS ──────────────────────────────────────────────────
  pgm.sql(`ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS search_vector tsvector`);
  pgm.sql(`UPDATE podcasts SET search_vector =
    setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(description, '')), 'B')
    WHERE search_vector IS NULL`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_podcasts_search ON podcasts USING GIN (search_vector)`);
  pgm.sql(`CREATE OR REPLACE FUNCTION podcasts_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('french', coalesce(NEW.description, '')), 'B');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`);
  pgm.sql(`DROP TRIGGER IF EXISTS trig_podcasts_search ON podcasts`);
  pgm.sql(`CREATE TRIGGER trig_podcasts_search
    BEFORE INSERT OR UPDATE OF title, description ON podcasts
    FOR EACH ROW EXECUTE FUNCTION podcasts_search_vector_update()`);

  // ── EMISSIONS ─────────────────────────────────────────────────
  pgm.sql(`ALTER TABLE emissions ADD COLUMN IF NOT EXISTS search_vector tsvector`);
  pgm.sql(`UPDATE emissions SET search_vector =
    setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('french', coalesce(description, '')), 'B')
    WHERE search_vector IS NULL`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_emissions_search ON emissions USING GIN (search_vector)`);
  pgm.sql(`CREATE OR REPLACE FUNCTION emissions_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('french', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('french', coalesce(NEW.description, '')), 'B');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`);
  pgm.sql(`DROP TRIGGER IF EXISTS trig_emissions_search ON emissions`);
  pgm.sql(`CREATE TRIGGER trig_emissions_search
    BEFORE INSERT OR UPDATE OF title, description ON emissions
    FOR EACH ROW EXECUTE FUNCTION emissions_search_vector_update()`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TRIGGER IF EXISTS trig_articles_search ON articles`);
  pgm.sql(`DROP TRIGGER IF EXISTS trig_podcasts_search ON podcasts`);
  pgm.sql(`DROP TRIGGER IF EXISTS trig_emissions_search ON emissions`);
  pgm.sql(`DROP FUNCTION IF EXISTS articles_search_vector_update()`);
  pgm.sql(`DROP FUNCTION IF EXISTS podcasts_search_vector_update()`);
  pgm.sql(`DROP FUNCTION IF EXISTS emissions_search_vector_update()`);
  pgm.sql(`DROP INDEX IF EXISTS idx_articles_search`);
  pgm.sql(`DROP INDEX IF EXISTS idx_podcasts_search`);
  pgm.sql(`DROP INDEX IF EXISTS idx_emissions_search`);
  pgm.sql(`ALTER TABLE articles DROP COLUMN IF EXISTS search_vector`);
  pgm.sql(`ALTER TABLE podcasts DROP COLUMN IF EXISTS search_vector`);
  pgm.sql(`ALTER TABLE emissions DROP COLUMN IF EXISTS search_vector`);
};
