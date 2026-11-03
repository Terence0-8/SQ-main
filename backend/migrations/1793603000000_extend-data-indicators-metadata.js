/**
 * SOLITIQUO DATA — MIGRATION 4 (LOT 3A)
 * Extension minimale et réversible des métadonnées méthodologiques de data_indicators :
 * - short_name, subdomain, data_nature, calculation_formula, expected_periodicity
 * - geographical_levels, producer_institution, producer_source_id, potential_sources
 * - methodological_limitations, availability_start_year, definition_status, status, metadata
 * 
 * Insertion des institutions officielles dans data_sources et alimentation du catalogue initial.
 */

'use strict';

const { OFFICIAL_INSTITUTIONS, INDICATORS_CATALOG } = require('../data/indicatorsCatalog');

exports.up = async (pgm) => {
  // 1. Extension du schéma de data_indicators
  pgm.sql(`
    ALTER TABLE data_indicators
      ADD COLUMN IF NOT EXISTS short_name VARCHAR(100),
      ADD COLUMN IF NOT EXISTS subdomain VARCHAR(100),
      ADD COLUMN IF NOT EXISTS data_nature VARCHAR(50),
      ADD COLUMN IF NOT EXISTS calculation_formula TEXT,
      ADD COLUMN IF NOT EXISTS expected_periodicity VARCHAR(50) DEFAULT 'ANNUAL',
      ADD COLUMN IF NOT EXISTS geographical_levels JSONB DEFAULT '["country"]',
      ADD COLUMN IF NOT EXISTS producer_institution VARCHAR(255),
      ADD COLUMN IF NOT EXISTS producer_source_id INTEGER REFERENCES data_sources(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS potential_sources TEXT,
      ADD COLUMN IF NOT EXISTS methodological_limitations TEXT,
      ADD COLUMN IF NOT EXISTS availability_start_year INTEGER,
      ADD COLUMN IF NOT EXISTS definition_status VARCHAR(50) DEFAULT 'proposed',
      ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'proposed',
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
  `);

  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_indicators_subdomain ON data_indicators(subdomain);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_indicators_status ON data_indicators(status);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_indicators_def_status ON data_indicators(definition_status);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_indicators_data_nature ON data_indicators(data_nature);`);

  // 2. Insertion des institutions officielles dans data_sources si inexistantes
  for (const inst of OFFICIAL_INSTITUTIONS) {
    pgm.sql(`
      INSERT INTO data_sources (name, acronym, institution_type, website_url, description)
      VALUES (
        '${inst.name.replace(/'/g, "''")}',
        '${inst.acronym}',
        '${inst.institution_type}',
        ${inst.website_url ? `'${inst.website_url}'` : 'NULL'},
        '${inst.description.replace(/'/g, "''")}'
      )
      ON CONFLICT DO NOTHING;
    `);
  }

  // 3. Insertion / actualisation des indicateurs du catalogue
  for (const ind of INDICATORS_CATALOG) {
    const geoLevels = JSON.stringify(ind.geographical_levels || ['country']);
    pgm.sql(`
      INSERT INTO data_indicators (
        code, name, short_name, description, category, subdomain, unit,
        data_nature, calculation_formula, expected_periodicity, geographical_levels,
        producer_institution, potential_sources, methodological_limitations,
        availability_start_year, definition_status, status, is_active
      ) VALUES (
        '${ind.code}',
        '${ind.name.replace(/'/g, "''")}',
        '${ind.short_name.replace(/'/g, "''")}',
        '${ind.description.replace(/'/g, "''")}',
        '${ind.category}',
        '${ind.subdomain}',
        '${ind.unit}',
        '${ind.data_nature}',
        ${ind.calculation_formula ? `'${ind.calculation_formula.replace(/'/g, "''")}'` : 'NULL'},
        '${ind.expected_periodicity}',
        '${geoLevels}'::jsonb,
        '${ind.producer_institution.replace(/'/g, "''")}',
        '${ind.potential_sources.replace(/'/g, "''")}',
        '${ind.methodological_limitations.replace(/'/g, "''")}',
        ${ind.availability_start_year || 'NULL'},
        '${ind.definition_status}',
        '${ind.status}',
        ${ind.status === 'active'}
      )
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        short_name = EXCLUDED.short_name,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        subdomain = EXCLUDED.subdomain,
        unit = EXCLUDED.unit,
        data_nature = EXCLUDED.data_nature,
        calculation_formula = EXCLUDED.calculation_formula,
        expected_periodicity = EXCLUDED.expected_periodicity,
        geographical_levels = EXCLUDED.geographical_levels,
        producer_institution = EXCLUDED.producer_institution,
        potential_sources = EXCLUDED.potential_sources,
        methodological_limitations = EXCLUDED.methodological_limitations,
        availability_start_year = EXCLUDED.availability_start_year,
        definition_status = EXCLUDED.definition_status,
        status = EXCLUDED.status,
        is_active = EXCLUDED.is_active,
        updated_at = NOW();
    `);
  }
};

exports.down = (pgm) => {
  pgm.sql(`DROP INDEX IF EXISTS idx_data_indicators_data_nature;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_data_indicators_def_status;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_data_indicators_status;`);
  pgm.sql(`DROP INDEX IF EXISTS idx_data_indicators_subdomain;`);

  pgm.sql(`
    ALTER TABLE data_indicators
      DROP COLUMN IF EXISTS metadata,
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS definition_status,
      DROP COLUMN IF EXISTS availability_start_year,
      DROP COLUMN IF EXISTS methodological_limitations,
      DROP COLUMN IF EXISTS potential_sources,
      DROP COLUMN IF EXISTS producer_source_id,
      DROP COLUMN IF EXISTS producer_institution,
      DROP COLUMN IF EXISTS geographical_levels,
      DROP COLUMN IF EXISTS expected_periodicity,
      DROP COLUMN IF EXISTS calculation_formula,
      DROP COLUMN IF EXISTS data_nature,
      DROP COLUMN IF EXISTS subdomain,
      DROP COLUMN IF EXISTS short_name;
  `);
};
