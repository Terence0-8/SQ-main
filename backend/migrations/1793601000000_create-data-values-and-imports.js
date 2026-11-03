/**
 * SOLITIQUO DATA — MIGRATION 2 (LOT 1B, PHASE 2)
 * Création du cœur statistique et des structures d'import :
 * 1. data_values (avec gestion explicite missing_reason, cohérence calendaire et unicité active)
 * 2. data_value_sources (multi-sourçage et protection transactionnelle de la source principale)
 * 3. data_value_breakdowns (ventilations, cohérence politique et interdiction des doublons)
 * 4. import_batches (suivi des lots, hash SHA-256 et cycle de vie)
 * 5. import_lines (lignes brutes JSONB, état et traçabilité des erreurs)
 */

exports.up = (pgm) => {
  // ============================================================
  // 1. TABLE DATA_VALUES
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS data_values (
      id BIGSERIAL PRIMARY KEY,
      indicator_id INTEGER NOT NULL REFERENCES data_indicators(id) ON DELETE RESTRICT,
      territory_id INTEGER NOT NULL REFERENCES territories(id) ON DELETE RESTRICT,
      period_type VARCHAR(20) NOT NULL CHECK (
        period_type IN ('ANNUAL', 'MONTHLY', 'QUARTERLY', 'DAILY', 'POINT_IN_TIME', 'MULTI_YEAR_CYCLE', 'ELECTORAL_CYCLE')
      ),
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      value_numeric NUMERIC(24, 6),
      value_text TEXT,
      missing_reason VARCHAR(30) CHECK (
        missing_reason IN ('not_available', 'confidential', 'not_applicable', 'temporarily_withheld')
      ),
      methodology_nature VARCHAR(50) NOT NULL CHECK (
        methodology_nature IN ('census', 'sample_survey', 'administrative_record', 'nowcast_estimate', 'projection')
      ),
      editorial_status VARCHAR(30) DEFAULT 'draft' NOT NULL CHECK (
        editorial_status IN ('draft', 'under_review', 'methodologically_validated', 'rejected', 'published', 'superseded', 'archived', 'revoked')
      ),
      is_active BOOLEAN DEFAULT FALSE NOT NULL,
      revision_number INTEGER DEFAULT 1 NOT NULL,
      supersedes_id BIGINT REFERENCES data_values(id) ON DELETE RESTRICT,
      superseded_by_id BIGINT REFERENCES data_values(id) ON DELETE RESTRICT,
      public_reason_summary VARCHAR(255),
      internal_notes TEXT,
      methodology_notes TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      validated_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      published_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

      -- Exactement une valeur numérique, ou textuelle, ou motif d'absence explicite
      CONSTRAINT chk_data_values_value_or_missing CHECK (
        (missing_reason IS NULL AND (
          (value_numeric IS NOT NULL AND value_text IS NULL) OR
          (value_numeric IS NULL AND value_text IS NOT NULL)
        )) OR
        (missing_reason IS NOT NULL AND value_numeric IS NULL AND value_text IS NULL)
      ),

      -- Cohérence calendaire stricte selon period_type
      CONSTRAINT chk_period_consistency CHECK (
        period_start <= period_end AND (
          (period_type = 'ANNUAL' 
           AND period_start = DATE_TRUNC('year', period_start)::DATE 
           AND period_end = (DATE_TRUNC('year', period_start) + INTERVAL '1 year - 1 day')::DATE)
          OR (period_type = 'MONTHLY' 
           AND period_start = DATE_TRUNC('month', period_start)::DATE 
           AND period_end = (DATE_TRUNC('month', period_start) + INTERVAL '1 month - 1 day')::DATE)
          OR (period_type = 'QUARTERLY' 
           AND period_start = DATE_TRUNC('quarter', period_start)::DATE 
           AND period_end = (DATE_TRUNC('quarter', period_start) + INTERVAL '3 months - 1 day')::DATE)
          OR (period_type IN ('DAILY', 'POINT_IN_TIME') 
           AND period_start = period_end)
          OR (period_type IN ('MULTI_YEAR_CYCLE', 'ELECTORAL_CYCLE') 
           AND period_start < period_end)
        )
      ),

      -- is_active = TRUE uniquement si editorial_status = 'published'
      CONSTRAINT chk_active_published CHECK (
        (is_active = FALSE) OR (is_active = TRUE AND editorial_status = 'published')
      )
    );
  `);

  // Index d'unicité de l'observation publiée et active
  pgm.sql(`
    CREATE UNIQUE INDEX uq_data_values_published_active
    ON data_values(indicator_id, territory_id, period_type, period_start, period_end, methodology_nature)
    WHERE (editorial_status = 'published' AND is_active = TRUE);
  `);

  // Index d'accès public et requêtes cartographiques
  pgm.sql(`
    CREATE INDEX idx_data_values_public_feed
    ON data_values(indicator_id, territory_id, period_start DESC)
    WHERE (editorial_status = 'published' AND is_active = TRUE);
  `);

  // Index de traversée de révision
  pgm.sql(`CREATE INDEX idx_data_values_supersedes ON data_values(supersedes_id);`);
  pgm.sql(`CREATE INDEX idx_data_values_superseded_by ON data_values(superseded_by_id);`);
  pgm.sql(`CREATE INDEX idx_data_values_editorial_status ON data_values(editorial_status);`);

  // Trigger d'interdiction d'écrasement sauvage d'une valeur publiée sur place
  pgm.sql(`
    CREATE OR REPLACE FUNCTION fn_protect_published_data_value_immutability()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.editorial_status = 'published' THEN
        IF (OLD.value_numeric IS DISTINCT FROM NEW.value_numeric OR
            OLD.value_text IS DISTINCT FROM NEW.value_text OR
            OLD.missing_reason IS DISTINCT FROM NEW.missing_reason OR
            OLD.indicator_id IS DISTINCT FROM NEW.indicator_id OR
            OLD.territory_id IS DISTINCT FROM NEW.territory_id OR
            OLD.period_type IS DISTINCT FROM NEW.period_type OR
            OLD.period_start IS DISTINCT FROM NEW.period_start OR
            OLD.period_end IS DISTINCT FROM NEW.period_end OR
            OLD.methodology_nature IS DISTINCT FROM NEW.methodology_nature) AND
           (NEW.editorial_status = 'published') THEN
          RAISE EXCEPTION 'INTERDICTION D''ÉCRASEMENT : Une observation publiée ne peut pas être modifiée sur place. Créez une nouvelle révision (supersedes_id) ou basculez son statut vers superseded/revoked.'
            USING ERRCODE = '55000';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_protect_published_data_value
    BEFORE UPDATE ON data_values
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_published_data_value_immutability();
  `);

  // ============================================================
  // 2. TABLE DATA_VALUE_SOURCES
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS data_value_sources (
      id BIGSERIAL PRIMARY KEY,
      data_value_id BIGINT NOT NULL REFERENCES data_values(id) ON DELETE RESTRICT,
      source_id INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
      source_role VARCHAR(30) NOT NULL CHECK (
        source_role IN ('primary', 'corroboration', 'methodology', 'conflicting')
      ),
      documentary_tier VARCHAR(30) NOT NULL CHECK (
        documentary_tier IN ('TIER_1_OFFICIAL', 'TIER_2_STATISTICAL', 'TIER_3_ACADEMIC_PEER', 'TIER_4_REPUTABLE_NGO', 'TIER_5_SECONDARY_PRESS')
      ),
      citation_reference TEXT NOT NULL,
      citation_url TEXT,
      methodological_robustness VARCHAR(20) DEFAULT 'high' CHECK (
        methodological_robustness IN ('high', 'medium', 'conditional', 'contentious')
      ),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT uq_data_value_source_role UNIQUE (data_value_id, source_id, source_role)
    );
  `);
  pgm.sql(`CREATE INDEX idx_data_value_sources_lookup ON data_value_sources(data_value_id, source_role);`);

  // Trigger transactionnel : validation/publication exige au moins 1 source primaire
  pgm.sql(`
    CREATE OR REPLACE FUNCTION fn_check_primary_source_on_data_value()
    RETURNS TRIGGER AS $$
    DECLARE
      v_has_primary BOOLEAN;
    BEGIN
      IF NEW.editorial_status IN ('methodologically_validated', 'published') THEN
        SELECT EXISTS (
          SELECT 1 
          FROM data_value_sources 
          WHERE data_value_id = NEW.id 
            AND source_role = 'primary'
        ) INTO v_has_primary;

        IF NOT v_has_primary THEN
          RAISE EXCEPTION 'VIOLATION DOCUMENTAIRE : L''observation (ID: %) au statut ''%'' doit obligatoirement disposer d''au moins une source principale (source_role = ''primary'').',
            NEW.id, NEW.editorial_status
            USING ERRCODE = '23514';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE CONSTRAINT TRIGGER trg_check_primary_source_on_data_value
    AFTER INSERT OR UPDATE OF editorial_status ON data_values
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION fn_check_primary_source_on_data_value();
  `);

  // Trigger transactionnel : interdire la suppression ou rétrogradation de la dernière source primaire
  pgm.sql(`
    CREATE OR REPLACE FUNCTION fn_protect_last_primary_source()
    RETURNS TRIGGER AS $$
    DECLARE
      v_status VARCHAR(30);
      v_remaining_primary INT;
      v_target_id BIGINT;
    BEGIN
      v_target_id := OLD.data_value_id;

      IF OLD.source_role = 'primary' AND (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.source_role <> 'primary')) THEN
        SELECT editorial_status INTO v_status FROM data_values WHERE id = v_target_id;

        IF v_status IN ('methodologically_validated', 'published') THEN
          SELECT COUNT(*) INTO v_remaining_primary 
          FROM data_value_sources 
          WHERE data_value_id = v_target_id 
            AND source_role = 'primary'
            AND id <> OLD.id;

          IF v_remaining_primary = 0 THEN
            RAISE EXCEPTION 'INTERDICTION : Impossible de supprimer ou de rétrograder la dernière source principale de l''observation (ID: %) au statut ''%''.',
              v_target_id, v_status
              USING ERRCODE = '23514';
          END IF;
        END IF;
      END IF;

      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;

    CREATE CONSTRAINT TRIGGER trg_protect_last_primary_source
    AFTER DELETE OR UPDATE OF source_role ON data_value_sources
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_last_primary_source();
  `);

  // ============================================================
  // 3. TABLE DATA_VALUE_BREAKDOWNS
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS data_value_breakdowns (
      id BIGSERIAL PRIMARY KEY,
      data_value_id BIGINT NOT NULL REFERENCES data_values(id) ON DELETE RESTRICT,
      breakdown_item_id INTEGER NOT NULL REFERENCES breakdown_items(id) ON DELETE RESTRICT,
      value_numeric NUMERIC(24, 6) NOT NULL,
      percentage NUMERIC(6, 3) CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
      rank INTEGER CHECK (rank IS NULL OR rank > 0),
      electoral_party_id INTEGER REFERENCES parties(id) ON DELETE RESTRICT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      CONSTRAINT uq_data_value_breakdown_item UNIQUE (data_value_id, breakdown_item_id)
    );
  `);
  pgm.sql(`CREATE INDEX idx_breakdowns_lookup ON data_value_breakdowns(data_value_id, breakdown_item_id);`);
  pgm.sql(`CREATE INDEX idx_breakdowns_item ON data_value_breakdowns(breakdown_item_id);`);
  pgm.sql(`CREATE INDEX idx_breakdowns_party ON data_value_breakdowns(electoral_party_id) WHERE electoral_party_id IS NOT NULL;`);

  // Trigger de cohérence politique : electoral_party_id autorisé uniquement pour candidats
  pgm.sql(`
    CREATE OR REPLACE FUNCTION fn_validate_breakdown_political_coherence()
    RETURNS TRIGGER AS $$
    DECLARE
      v_dim_type VARCHAR(30);
    BEGIN
      SELECT bd.dimension_type INTO v_dim_type
      FROM breakdown_items bi
      JOIN breakdown_dimensions bd ON bd.id = bi.dimension_id
      WHERE bi.id = NEW.breakdown_item_id;

      IF v_dim_type <> 'electoral_candidate' AND NEW.electoral_party_id IS NOT NULL THEN
        RAISE EXCEPTION 'INCOHÉRENCE DE VENTILATION : Le rattachement électoral (electoral_party_id) n''est autorisé que pour les items de dimension candidat électoral (dimension_type = ''electoral_candidate'').'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_validate_breakdown_political_coherence
    BEFORE INSERT OR UPDATE ON data_value_breakdowns
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_breakdown_political_coherence();
  `);

  // ============================================================
  // 4. TABLE IMPORT_BATCHES
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS import_batches (
      id SERIAL PRIMARY KEY,
      file_name VARCHAR(255) NOT NULL,
      file_size_bytes BIGINT NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      sha256_checksum CHAR(64) NOT NULL,
      total_lines INTEGER DEFAULT 0 NOT NULL,
      valid_lines INTEGER DEFAULT 0 NOT NULL,
      error_lines INTEGER DEFAULT 0 NOT NULL,
      status VARCHAR(30) DEFAULT 'uploaded' NOT NULL CHECK (
        status IN ('uploaded', 'validating', 'validated', 'rejected', 'applied', 'reverted')
      ),
      storage_path TEXT,
      file_purged_at TIMESTAMPTZ,
      file_purged_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);
  pgm.sql(`CREATE INDEX idx_import_batches_status ON import_batches(status);`);
  pgm.sql(`CREATE INDEX idx_import_batches_checksum ON import_batches(sha256_checksum);`);

  // ============================================================
  // 5. TABLE IMPORT_LINES
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS import_lines (
      id BIGSERIAL PRIMARY KEY,
      batch_id INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE RESTRICT,
      line_number INTEGER NOT NULL,
      raw_payload JSONB NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' NOT NULL CHECK (
        status IN ('pending', 'valid', 'error', 'imported')
      ),
      error_message TEXT,
      data_value_id BIGINT REFERENCES data_values(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      CONSTRAINT uq_import_line_batch_number UNIQUE (batch_id, line_number)
    );
  `);
  pgm.sql(`CREATE INDEX idx_import_lines_batch_status ON import_lines(batch_id, status);`);
  pgm.sql(`CREATE INDEX idx_import_lines_data_value ON import_lines(data_value_id) WHERE data_value_id IS NOT NULL;`);
};

exports.down = (pgm) => {
  // Suppression dans l'ordre inverse strict des dépendances
  pgm.sql(`DROP TABLE IF EXISTS import_lines;`);
  pgm.sql(`DROP TABLE IF EXISTS import_batches;`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_validate_breakdown_political_coherence ON data_value_breakdowns;`);
  pgm.sql(`DROP FUNCTION IF EXISTS fn_validate_breakdown_political_coherence;`);
  pgm.sql(`DROP TABLE IF EXISTS data_value_breakdowns;`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_protect_last_primary_source ON data_value_sources;`);
  pgm.sql(`DROP FUNCTION IF EXISTS fn_protect_last_primary_source;`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_check_primary_source_on_data_value ON data_values;`);
  pgm.sql(`DROP FUNCTION IF EXISTS fn_check_primary_source_on_data_value;`);
  pgm.sql(`DROP TABLE IF EXISTS data_value_sources;`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_protect_published_data_value ON data_values;`);
  pgm.sql(`DROP FUNCTION IF EXISTS fn_protect_published_data_value_immutability;`);
  pgm.sql(`DROP TABLE IF EXISTS data_values;`);
};
