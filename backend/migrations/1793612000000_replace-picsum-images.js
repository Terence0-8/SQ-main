/**
 * SOLITIQUO — MIGRATION 23
 * Remplace définitivement les URLs picsum.photos instables / en timeout
 * par des visuels éditoriaux haute résolution fiables (Unsplash / thématiques)
 */

exports.up = (pgm) => {
  pgm.sql(`
    -- 1. Hero / Politique
    UPDATE articles
    SET featured_image = 'https://images.unsplash.com/photo-1540910419892-4a36d2c3266c?w=1600'
    WHERE featured_image LIKE '%picsum.photos%' AND (title ILIKE '%Paul Biya%' OR category = 'Politique');

    -- 2. Social
    UPDATE articles
    SET featured_image = 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800'
    WHERE featured_image LIKE '%picsum.photos%' AND category = 'Social';

    -- 3. Économie
    UPDATE articles
    SET featured_image = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800'
    WHERE featured_image LIKE '%picsum.photos%' AND category = 'Économie';

    -- 4. Culture
    UPDATE articles
    SET featured_image = 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=800'
    WHERE featured_image LIKE '%picsum.photos%' AND category = 'Culture';

    -- 5. Reste / Géopolitique
    UPDATE articles
    SET featured_image = 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800'
    WHERE featured_image LIKE '%picsum.photos%';
  `);
};

exports.down = (_pgm) => {
  // Pas de rollback nécessaire vers picsum.photos
};

