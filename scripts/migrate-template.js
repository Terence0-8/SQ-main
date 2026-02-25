/* eslint-disable camelcase */

exports.up = (pgm) => {
  // TODO: écrire la migration
  // Exemples :
  //   pgm.addColumn('table', { colonne: { type: 'TEXT' } });
  //   pgm.sql(`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`);
  throw new Error('Migration "up" non implémentée');
};

exports.down = (pgm) => {
  // TODO: écrire le rollback (inverse exact du up)
  // Exemples :
  //   pgm.dropColumn('table', 'colonne');
  //   pgm.sql(`ALTER TABLE ... DROP COLUMN IF EXISTS ...`);
  throw new Error('Migration "down" non implémentée');
};
