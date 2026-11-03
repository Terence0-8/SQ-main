/**
 * SOLITIQUO DATA — MIGRATION 3 (LOT 1B, PHASE 3)
 * Traçabilité historique, registre d'audit et immutabilité :
 * 1. data_value_versions (snapshots immuables complets lors de la publication)
 * 2. data_value_audit_log (journal d'audit inaltérable des opérations et mutations)
 * 3. Triggers bloquants Append-Only (interdiction d'UPDATE, DELETE et TRUNCATE)
 * 4. Triggers automatiques de snapshotting et de journalisation des transitions
 * 5. Configuration DCL des privilèges de moindre privilège
 */

exports.up = (pgm) => {
  // ============================================================
  // 1. TABLE DATA_VALUE_VERSIONS (Snapshots immuables)
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS data_value_versions (
      id BIGSERIAL PRIMARY KEY,
      data_value_id BIGINT NOT NULL REFERENCES data_values(id) ON DELETE RESTRICT,
      revision_number INTEGER NOT NULL,
      indicator_id INTEGER NOT NULL REFERENCES data_indicators(id) ON DELETE RESTRICT,
      territory_id INTEGER NOT NULL REFERENCES territories(id) ON DELETE RESTRICT,
      period_type VARCHAR(20) NOT NULL,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      value_numeric NUMERIC(24, 6),
      value_text TEXT,
      missing_reason VARCHAR(30),
      methodology_nature VARCHAR(50) NOT NULL,
      editorial_status VARCHAR(30) NOT NULL,
      breakdowns_snapshot JSONB DEFAULT '[]'::jsonb NOT NULL,
      sources_snapshot JSONB DEFAULT '[]'::jsonb NOT NULL,
      public_reason_summary VARCHAR(255),
      internal_notes TEXT,
      methodology_notes TEXT,
      supersedes_id BIGINT,
      superseded_by_id BIGINT,
      validated_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      published_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      published_at TIMESTAMPTZ,
      recorded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      recorded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT uq_data_value_version_revision UNIQUE (data_value_id, revision_number)
    );
  `);

  pgm.sql(`CREATE INDEX idx_data_value_versions_lookup ON data_value_versions(data_value_id, revision_number DESC);`);
  pgm.sql(`CREATE INDEX idx_data_value_versions_gin_breakdowns ON data_value_versions USING GIN (breakdowns_snapshot);`);
  pgm.sql(`CREATE INDEX idx_data_value_versions_gin_sources ON data_value_versions USING GIN (sources_snapshot);`);

  // ============================================================
  // 2. TABLE DATA_VALUE_AUDIT_LOG (Journal inaltérable)
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS data_value_audit_log (
      id BIGSERIAL PRIMARY KEY,
      data_value_id BIGINT,
      action VARCHAR(50) NOT NULL,
      old_status VARCHAR(30),
      new_status VARCHAR(30),
      reason TEXT,
      diff_payload JSONB DEFAULT '{}'::jsonb NOT NULL,
      performed_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
      ip_address INET,
      user_agent TEXT,
      performed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);

  pgm.sql(`CREATE INDEX idx_data_value_audit_log_target ON data_value_audit_log(data_value_id, performed_at DESC);`);
  pgm.sql(`CREATE INDEX idx_data_value_audit_log_action ON data_value_audit_log(action);`);

  // ============================================================
  // 3. FONCTIONS ET TRIGGERS DE PROTECTION IMMUTABLE (APPEND-ONLY)
  // ============================================================
  // Protection ligne par ligne (UPDATE / DELETE)
  pgm.sql(`
    CREATE OR REPLACE FUNCTION fn_prevent_tampering_append_only()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'VIOLATION D''IMMUTABILITÉ : La table % est strictement en mode Append-Only. Aucune instruction UPDATE ou DELETE n''est permise.', TG_TABLE_NAME
        USING ERRCODE = '55000';
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Protection par instruction de table (TRUNCATE)
  pgm.sql(`
    CREATE OR REPLACE FUNCTION fn_prevent_statement_truncate_audit()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'VIOLATION D''IMMUTABILITÉ : L''instruction TRUNCATE est formellement interdite sur la table %.', TG_TABLE_NAME
        USING ERRCODE = '55000';
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Triggers sur data_value_versions
  pgm.sql(`
    CREATE TRIGGER trg_protect_versions_no_update_delete
    BEFORE UPDATE OR DELETE ON data_value_versions
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_tampering_append_only();

    CREATE TRIGGER trg_protect_versions_no_truncate
    BEFORE TRUNCATE ON data_value_versions
    FOR EACH STATEMENT
    EXECUTE FUNCTION fn_prevent_statement_truncate_audit();
  `);

  // Triggers sur data_value_audit_log
  pgm.sql(`
    CREATE TRIGGER trg_protect_audit_log_no_update_delete
    BEFORE UPDATE OR DELETE ON data_value_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_tampering_append_only();

    CREATE TRIGGER trg_protect_audit_log_no_truncate
    BEFORE TRUNCATE ON data_value_audit_log
    FOR EACH STATEMENT
    EXECUTE FUNCTION fn_prevent_statement_truncate_audit();
  `);

  // ============================================================
  // 4. TRIGGER AUTOMATIQUE DE SNAPSHOTTING LORS DE LA PUBLICATION
  // ============================================================
  pgm.sql(`
    CREATE OR REPLACE FUNCTION fn_create_data_value_version_snapshot()
    RETURNS TRIGGER AS $$
    DECLARE
      v_breakdowns JSONB;
      v_sources JSONB;
      v_recorder_id INTEGER;
    BEGIN
      -- Déclenché lorsque l'observation est au statut publié
      IF NEW.editorial_status = 'published' THEN
        -- Vérifier si le snapshot n'a pas déjà été enregistré
        IF NOT EXISTS (
          SELECT 1 FROM data_value_versions 
          WHERE data_value_id = NEW.id AND revision_number = NEW.revision_number
        ) THEN
          -- Capturer toutes les ventilations et leur contexte électoral
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', dvb.id,
                'breakdown_item_id', dvb.breakdown_item_id,
                'item_code', bi.code,
                'item_label', bi.label,
                'dimension_code', bd.code,
                'dimension_label', bd.label,
                'value_numeric', dvb.value_numeric,
                'percentage', dvb.percentage,
                'rank', dvb.rank,
                'electoral_party_id', dvb.electoral_party_id,
                'electoral_party_name', p.name,
                'notes', dvb.notes
              ) ORDER BY dvb.rank ASC NULLS LAST, dvb.id ASC
            ),
            '[]'::jsonb
          ) INTO v_breakdowns
          FROM data_value_breakdowns dvb
          JOIN breakdown_items bi ON bi.id = dvb.breakdown_item_id
          JOIN breakdown_dimensions bd ON bd.id = bi.dimension_id
          LEFT JOIN parties p ON p.id = dvb.electoral_party_id
          WHERE dvb.data_value_id = NEW.id;

          -- Capturer toutes les sources documentaires et leurs cotes
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', dvs.id,
                'source_id', dvs.source_id,
                'source_name', ds.name,
                'source_role', dvs.source_role,
                'documentary_tier', dvs.documentary_tier,
                'citation_reference', dvs.citation_reference,
                'citation_url', dvs.citation_url,
                'methodological_robustness', dvs.methodological_robustness,
                'notes', dvs.notes
              ) ORDER BY CASE WHEN dvs.source_role = 'primary' THEN 1 ELSE 2 END, dvs.id ASC
            ),
            '[]'::jsonb
          ) INTO v_sources
          FROM data_value_sources dvs
          JOIN data_sources ds ON ds.id = dvs.source_id
          WHERE dvs.data_value_id = NEW.id;

          v_recorder_id := COALESCE(NEW.published_by, NEW.validated_by, NEW.created_by);

          INSERT INTO data_value_versions (
            data_value_id,
            revision_number,
            indicator_id,
            territory_id,
            period_type,
            period_start,
            period_end,
            value_numeric,
            value_text,
            missing_reason,
            methodology_nature,
            editorial_status,
            breakdowns_snapshot,
            sources_snapshot,
            public_reason_summary,
            internal_notes,
            methodology_notes,
            supersedes_id,
            superseded_by_id,
            validated_by,
            published_by,
            published_at,
            recorded_at,
            recorded_by
          ) VALUES (
            NEW.id,
            NEW.revision_number,
            NEW.indicator_id,
            NEW.territory_id,
            NEW.period_type,
            NEW.period_start,
            NEW.period_end,
            NEW.value_numeric,
            NEW.value_text,
            NEW.missing_reason,
            NEW.methodology_nature,
            NEW.editorial_status,
            v_breakdowns,
            v_sources,
            NEW.public_reason_summary,
            NEW.internal_notes,
            NEW.methodology_notes,
            NEW.supersedes_id,
            NEW.superseded_by_id,
            NEW.validated_by,
            NEW.published_by,
            COALESCE(NEW.published_at, NOW()),
            NOW(),
            v_recorder_id
          );
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE CONSTRAINT TRIGGER trg_create_data_value_version_snapshot
    AFTER INSERT OR UPDATE ON data_values
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION fn_create_data_value_version_snapshot();
  `);

  // ============================================================
  // 5. TRIGGER AUTOMATIQUE DE JOURNALISATION DES MUTATIONS (AUDIT)
  // ============================================================
  pgm.sql(`
    CREATE OR REPLACE FUNCTION fn_audit_data_values_mutations()
    RETURNS TRIGGER AS $$
    DECLARE
      v_action VARCHAR(50);
      v_reason TEXT;
      v_diff JSONB;
      v_user_id INTEGER;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        v_action := 'CREATE';
        v_reason := NEW.public_reason_summary;
        v_user_id := NEW.created_by;
        v_diff := jsonb_build_object(
          'indicator_id', NEW.indicator_id,
          'territory_id', NEW.territory_id,
          'period_type', NEW.period_type,
          'period_start', NEW.period_start,
          'period_end', NEW.period_end,
          'editorial_status', NEW.editorial_status,
          'value_numeric', NEW.value_numeric,
          'value_text', NEW.value_text,
          'missing_reason', NEW.missing_reason
        );

        INSERT INTO data_value_audit_log (
          data_value_id, action, old_status, new_status, reason, diff_payload, performed_by, performed_at
        ) VALUES (
          NEW.id, v_action, NULL, NEW.editorial_status, v_reason, v_diff, v_user_id, NOW()
        );

      ELSIF TG_OP = 'UPDATE' THEN
        -- Détection de l'action selon la transition de statut
        IF OLD.editorial_status IS DISTINCT FROM NEW.editorial_status THEN
          IF NEW.editorial_status = 'under_review' THEN
            v_action := 'SUBMIT_REVIEW';
          ELSIF NEW.editorial_status = 'methodologically_validated' THEN
            v_action := 'VALIDATE_METHODOLOGY';
          ELSIF NEW.editorial_status = 'rejected' THEN
            v_action := 'REJECT';
          ELSIF NEW.editorial_status = 'published' THEN
            IF NEW.supersedes_id IS NOT NULL THEN
              v_action := 'PUBLISH_REVISION';
            ELSE
              v_action := 'PUBLISH';
            END IF;
          ELSIF NEW.editorial_status = 'superseded' THEN
            v_action := 'SUPERSEDE';
          ELSIF NEW.editorial_status = 'revoked' THEN
            v_action := 'REVOKE';
          ELSIF NEW.editorial_status = 'archived' THEN
            v_action := 'ARCHIVE';
          ELSE
            v_action := 'STATUS_CHANGE';
          END IF;
        ELSE
          v_action := 'UPDATE_DRAFT';
        END IF;

        v_reason := COALESCE(NEW.public_reason_summary, NEW.internal_notes);
        v_user_id := COALESCE(NEW.published_by, NEW.validated_by, NEW.created_by);

        v_diff := '{}'::jsonb;
        IF OLD.editorial_status IS DISTINCT FROM NEW.editorial_status THEN
          v_diff := v_diff || jsonb_build_object('editorial_status', jsonb_build_object('old', OLD.editorial_status, 'new', NEW.editorial_status));
        END IF;
        IF OLD.value_numeric IS DISTINCT FROM NEW.value_numeric THEN
          v_diff := v_diff || jsonb_build_object('value_numeric', jsonb_build_object('old', OLD.value_numeric, 'new', NEW.value_numeric));
        END IF;
        IF OLD.value_text IS DISTINCT FROM NEW.value_text THEN
          v_diff := v_diff || jsonb_build_object('value_text', jsonb_build_object('old', OLD.value_text, 'new', NEW.value_text));
        END IF;
        IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
          v_diff := v_diff || jsonb_build_object('is_active', jsonb_build_object('old', OLD.is_active, 'new', NEW.is_active));
        END IF;
        IF OLD.superseded_by_id IS DISTINCT FROM NEW.superseded_by_id THEN
          v_diff := v_diff || jsonb_build_object('superseded_by_id', jsonb_build_object('old', OLD.superseded_by_id, 'new', NEW.superseded_by_id));
        END IF;

        INSERT INTO data_value_audit_log (
          data_value_id, action, old_status, new_status, reason, diff_payload, performed_by, performed_at
        ) VALUES (
          NEW.id, v_action, OLD.editorial_status, NEW.editorial_status, v_reason, v_diff, v_user_id, NOW()
        );
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_audit_data_values_mutations
    AFTER INSERT OR UPDATE ON data_values
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_data_values_mutations();
  `);

  // ============================================================
  // 6. SÉCURISATION DCL DES PRIVILÈGES (RÔLE APPLICATIF)
  // ============================================================
  pgm.sql(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'solitiquo_app') THEN
        CREATE ROLE solitiquo_app WITH LOGIN;
      END IF;
    END $$;

    GRANT SELECT, INSERT ON data_value_versions, data_value_audit_log TO solitiquo_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON data_value_versions, data_value_audit_log FROM solitiquo_app, PUBLIC;
  `);
};

exports.down = (pgm) => {
  // Suppression dans l'ordre inverse strict
  pgm.sql(`DROP TRIGGER IF EXISTS trg_audit_data_values_mutations ON data_values;`);
  pgm.sql(`DROP FUNCTION IF EXISTS fn_audit_data_values_mutations;`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_create_data_value_version_snapshot ON data_values;`);
  pgm.sql(`DROP FUNCTION IF EXISTS fn_create_data_value_version_snapshot;`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_protect_audit_log_no_truncate ON data_value_audit_log;`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_protect_audit_log_no_update_delete ON data_value_audit_log;`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_protect_versions_no_truncate ON data_value_versions;`);
  pgm.sql(`DROP TRIGGER IF EXISTS trg_protect_versions_no_update_delete ON data_value_versions;`);
  pgm.sql(`DROP FUNCTION IF EXISTS fn_prevent_statement_truncate_audit;`);
  pgm.sql(`DROP FUNCTION IF EXISTS fn_prevent_tampering_append_only;`);
  pgm.sql(`DROP TABLE IF EXISTS data_value_audit_log;`);
  pgm.sql(`DROP TABLE IF EXISTS data_value_versions;`);
};
