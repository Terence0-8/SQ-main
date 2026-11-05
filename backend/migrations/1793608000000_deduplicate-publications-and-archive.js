/**
 * SOLITIQUO DATA — MIGRATION 9 (LOT 3D)
 * Réconciliation, déduplication et archivage sécurisé du corpus documentaire :
 * 1. Création de data_publications_archive pour conserver l'historique complet des 27 doublons.
 * 2. Création de data_publication_indicators_archive pour préserver les liaisons initiales.
 * 3. Redirection des relations data_publication_indicators vers l'enregistrement principal.
 * 4. Déduplication de data_publications ramenant le corpus à 34 enregistrements canoniques uniques.
 * 5. Ajout d'une contrainte d'unicité sur LOWER(TRIM(title)) pour prévenir toute duplication future.
 * 6. Réversibilité intégrale via exports.down.
 */

'use strict';

exports.up = (pgm) => {
  // 1. Table d'archivage des publications dédupliquées
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS data_publications_archive (
      id SERIAL PRIMARY KEY,
      original_id INTEGER NOT NULL UNIQUE,
      primary_id INTEGER NOT NULL REFERENCES data_publications(id) ON DELETE CASCADE,
      institution_id INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
      title VARCHAR(255) NOT NULL,
      publisher_organization VARCHAR(255),
      publication_year INTEGER,
      coverage_period_start VARCHAR(50),
      coverage_period_end VARCHAR(50),
      document_category VARCHAR(50),
      documentary_tier VARCHAR(50),
      url TEXT,
      bibliographic_reference TEXT,
      geographical_coverage VARCHAR(50),
      consultation_date DATE,
      verification_status VARCHAR(50),
      notes TEXT,
      original_created_at TIMESTAMPTZ,
      original_updated_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      archive_reason TEXT DEFAULT 'Doublon réconcilié lors du Lot 3D'
    );
  `);

  // 2. Table d'archivage des relations publication <-> indicateur associées aux doublons
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS data_publication_indicators_archive (
      id SERIAL PRIMARY KEY,
      original_publication_id INTEGER NOT NULL,
      indicator_id INTEGER NOT NULL,
      specific_section VARCHAR(255),
      notes TEXT,
      created_at TIMESTAMPTZ,
      archived_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);

  // 3. Table temporaire des 27 paires de doublons identifiées
  pgm.sql(`
    CREATE TEMP TABLE temp_duplicate_pairs (
      duplicate_id INTEGER PRIMARY KEY,
      primary_id INTEGER NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO temp_duplicate_pairs (duplicate_id, primary_id) VALUES
      (28, 1),
      (29, 2),
      (30, 3),
      (31, 4),
      (32, 5),
      (33, 6),
      (34, 7),
      (35, 8),
      (36, 9),
      (37, 10),
      (38, 11),
      (39, 12),
      (40, 13),
      (41, 14),
      (46, 15),
      (47, 16),
      (48, 17),
      (49, 18),
      (50, 19),
      (51, 20),
      (53, 21),
      (54, 22),
      (55, 23),
      (56, 24),
      (57, 25),
      (58, 26),
      (61, 27);
  `);

  // 4. Archiver les 27 publications doublons
  pgm.sql(`
    INSERT INTO data_publications_archive (
      original_id, primary_id, institution_id, title, publisher_organization,
      publication_year, coverage_period_start, coverage_period_end, document_category,
      documentary_tier, url, bibliographic_reference, geographical_coverage,
      consultation_date, verification_status, notes, original_created_at, original_updated_at,
      archive_reason
    )
    SELECT 
      dp.id,
      m.primary_id,
      dp.institution_id,
      dp.title,
      dp.publisher_organization,
      dp.publication_year,
      dp.coverage_period_start,
      dp.coverage_period_end,
      dp.document_category,
      dp.documentary_tier,
      dp.url,
      dp.bibliographic_reference,
      dp.geographical_coverage,
      dp.consultation_date,
      dp.verification_status,
      dp.notes,
      dp.created_at,
      dp.updated_at,
      'Doublon réconcilié lors du Lot 3D'
    FROM data_publications dp
    JOIN temp_duplicate_pairs m ON m.duplicate_id = dp.id
    ON CONFLICT (original_id) DO NOTHING;
  `);

  // 5. Archiver les liens d'indicateurs existants sur les doublons avant modification
  pgm.sql(`
    INSERT INTO data_publication_indicators_archive (
      original_publication_id, indicator_id, specific_section, notes, created_at
    )
    SELECT dpi.publication_id, dpi.indicator_id, dpi.specific_section, dpi.notes, dpi.created_at
    FROM data_publication_indicators dpi
    JOIN temp_duplicate_pairs m ON m.duplicate_id = dpi.publication_id;
  `);

  // 6. Résoudre les conflits dans data_publication_indicators :
  // A. Supprimer le lien du doublon si le primaire a déjà une relation avec cet indicateur
  pgm.sql(`
    DELETE FROM data_publication_indicators dpi
    USING temp_duplicate_pairs m
    WHERE dpi.publication_id = m.duplicate_id
      AND EXISTS (
        SELECT 1 FROM data_publication_indicators p_link
        WHERE p_link.publication_id = m.primary_id
          AND p_link.indicator_id = dpi.indicator_id
      );
  `);

  // B. Rediriger vers le primaire les liens non encore existants sur le primaire
  pgm.sql(`
    UPDATE data_publication_indicators dpi
    SET publication_id = m.primary_id
    FROM temp_duplicate_pairs m
    WHERE dpi.publication_id = m.duplicate_id;
  `);

  // 7. Supprimer les 27 enregistrements doublons de data_publications
  pgm.sql(`
    DELETE FROM data_publications dp
    USING temp_duplicate_pairs m
    WHERE dp.id = m.duplicate_id;
  `);

  // 8. Poser la contrainte d'unicité pour garantir l'absence de doublons futurs
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_data_publications_title 
    ON data_publications (LOWER(TRIM(title)));
  `);
};

exports.down = (pgm) => {
  // 1. Supprimer l'index unique
  pgm.sql(`DROP INDEX IF EXISTS uq_data_publications_title;`);

  // 2. Restaurer les 27 enregistrements depuis data_publications_archive
  pgm.sql(`
    INSERT INTO data_publications (
      id, institution_id, title, publisher_organization,
      publication_year, coverage_period_start, coverage_period_end, document_category,
      documentary_tier, url, bibliographic_reference, geographical_coverage,
      consultation_date, verification_status, notes, created_at, updated_at
    )
    SELECT 
      original_id, institution_id, title, publisher_organization,
      publication_year, coverage_period_start, coverage_period_end, document_category,
      documentary_tier, url, bibliographic_reference, geographical_coverage,
      consultation_date, verification_status, notes, original_created_at, original_updated_at
    FROM data_publications_archive
    ON CONFLICT (id) DO NOTHING;
  `);

  // 3. Réaligner la séquence ID
  pgm.sql(`
    SELECT setval(pg_get_serial_sequence('data_publications', 'id'), COALESCE((SELECT MAX(id) FROM data_publications), 1));
  `);

  // 4. Restaurer les relations data_publication_indicators
  pgm.sql(`
    INSERT INTO data_publication_indicators (
      publication_id, indicator_id, specific_section, notes, created_at
    )
    SELECT 
      original_publication_id, indicator_id, specific_section, notes, created_at
    FROM data_publication_indicators_archive
    ON CONFLICT (publication_id, indicator_id) DO NOTHING;
  `);

  // 5. Supprimer les tables d'archive
  pgm.sql(`DROP TABLE IF EXISTS data_publication_indicators_archive;`);
  pgm.sql(`DROP TABLE IF EXISTS data_publications_archive;`);
};

