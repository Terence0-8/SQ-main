// Migration pour ajouter is_featured_politique et is_featured_social sur podcasts

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS is_featured_politique BOOLEAN DEFAULT FALSE`);
  pgm.sql(`ALTER TABLE podcasts ADD COLUMN IF NOT EXISTS is_featured_social BOOLEAN DEFAULT FALSE`);
};

exports.down = (pgm) => {
  pgm.sql(`ALTER TABLE podcasts DROP COLUMN IF EXISTS is_featured_politique`);
  pgm.sql(`ALTER TABLE podcasts DROP COLUMN IF EXISTS is_featured_social`);
};
