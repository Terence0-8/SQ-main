/**
 * SOLITIQUO — MIGRATION 22
 * Ajout de la colonne `is_demo` sur la table `articles`
 * Permet d'identifier sans ambiguïté les contenus de démonstration / simulation
 * éditoriale tout en préservant le cycle de vie normal des articles.
 */

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE articles 
    ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
    
    CREATE INDEX IF NOT EXISTS idx_articles_is_demo ON articles(is_demo);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_articles_is_demo;
    ALTER TABLE articles DROP COLUMN IF EXISTS is_demo;
  `);
};

