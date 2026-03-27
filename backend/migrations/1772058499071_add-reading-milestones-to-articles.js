
/**
 * Ajoute les colonnes de suivi de lecture par milestone
 * Utilisées par POST /api/analytics/track et GET /api/analytics/reading-progress
 */

exports.up = (pgm) => {
  pgm.addColumns('articles', {
    reads_start: { type: 'integer', notNull: true, default: 0 },
    reads_25:    { type: 'integer', notNull: true, default: 0 },
    reads_50:    { type: 'integer', notNull: true, default: 0 },
    reads_75:    { type: 'integer', notNull: true, default: 0 },
    reads_100:   { type: 'integer', notNull: true, default: 0 },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('articles', ['reads_start', 'reads_25', 'reads_50', 'reads_75', 'reads_100']);
};
