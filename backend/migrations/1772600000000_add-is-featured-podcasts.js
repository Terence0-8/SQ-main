/* eslint-disable camelcase */
// Ajoute is_featured sur podcasts (anciennement géré par ALTER TABLE au runtime dans podcasts.js)

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_podcasts_featured ON podcasts(is_featured) WHERE is_featured = TRUE`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_podcasts_featured`);
  pgm.sql(`ALTER TABLE podcasts DROP COLUMN IF EXISTS is_featured`);
};
