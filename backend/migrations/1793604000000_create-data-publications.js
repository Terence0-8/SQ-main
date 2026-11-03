/**
 * SOLITIQUO DATA — MIGRATION 5 (LOT 3B)
 * Création du socle documentaire statistique :
 * 1. data_publications : référentiel des publications statistiques (rapports, enquêtes, lois, annuaires)
 * 2. data_publication_indicators : relation plusieurs-à-plusieurs reliant publications et indicateurs documentés
 */

'use strict';

exports.up = (pgm) => {
  // 1. Table des publications statistiques
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS data_publications (
      id SERIAL PRIMARY KEY,
      institution_id INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
      title VARCHAR(255) NOT NULL,
      publisher_organization VARCHAR(255),
      publication_year INTEGER,
      coverage_period_start VARCHAR(50),
      coverage_period_end VARCHAR(50),
      document_category VARCHAR(50) NOT NULL CHECK (
        document_category IN (
          'census',
          'survey',
          'national_accounts',
          'budget_law',
          'statistical_yearbook',
          'administrative_report',
          'periodic_bulletin',
          'demographic_projection',
          'electoral_decision',
          'academic_study',
          'international_database'
        )
      ),
      documentary_tier VARCHAR(50) DEFAULT 'TIER_1_OFFICIAL',
      url TEXT,
      bibliographic_reference TEXT,
      geographical_coverage VARCHAR(50) DEFAULT 'national',
      consultation_date DATE,
      verification_status VARCHAR(50) NOT NULL CHECK (
        verification_status IN (
          'verified_consulted',
          'identified_unconsulted',
          'potential_to_search',
          'unavailable_or_broken'
        )
      ),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_publications_institution ON data_publications(institution_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_publications_status ON data_publications(verification_status);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_publications_category ON data_publications(document_category);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_publications_year ON data_publications(publication_year);`);

  // 2. Table de liaison publications <-> indicateurs
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS data_publication_indicators (
      publication_id INTEGER NOT NULL REFERENCES data_publications(id) ON DELETE CASCADE,
      indicator_id INTEGER NOT NULL REFERENCES data_indicators(id) ON DELETE CASCADE,
      specific_section VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      PRIMARY KEY (publication_id, indicator_id)
    );
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_dpi_publication ON data_publication_indicators(publication_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_dpi_indicator ON data_publication_indicators(indicator_id);`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS data_publication_indicators;`);
  pgm.sql(`DROP TABLE IF EXISTS data_publications;`);
};
