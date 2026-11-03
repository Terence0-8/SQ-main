/**
 * SOLITIQUO DATA — MIGRATION 1 (LOT 1B)
 * Création des tables du socle référentiel :
 * 1. territories
 * 2. data_indicators
 * 3. data_sources
 * 4. candidates
 * 5. breakdown_dimensions
 * 6. breakdown_items
 * 
 * Avec intégrité des dimensions, GeoJSON JSONB et insertion initiale des 10 régions du Cameroun.
 */

exports.up = (pgm) => {
  // ============================================================
  // 1. TABLE TERRITORIES
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS territories (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(30) NOT NULL CHECK (type IN ('country', 'region', 'department', 'arrondissement', 'constituency', 'municipality')),
      parent_id INTEGER REFERENCES territories(id) ON DELETE RESTRICT,
      geom_geojson JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_territories_parent_id ON territories(parent_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_territories_type ON territories(type);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_territories_code ON territories(code);`);

  // ============================================================
  // 2. TABLE DATA_INDICATORS
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS data_indicators (
      id SERIAL PRIMARY KEY,
      code VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(100) NOT NULL,
      unit VARCHAR(50) NOT NULL,
      is_active BOOLEAN DEFAULT TRUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_indicators_category ON data_indicators(category);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_indicators_active ON data_indicators(is_active);`);

  // ============================================================
  // 3. TABLE DATA_SOURCES
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS data_sources (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      acronym VARCHAR(50),
      institution_type VARCHAR(50) NOT NULL CHECK (
        institution_type IN (
          'national_statistical_office',
          'ministry',
          'central_bank',
          'electoral_commission',
          'un_agency',
          'academic_institute',
          'independent_ngo',
          'media_consortium',
          'other'
        )
      ),
      website_url TEXT,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_data_sources_type ON data_sources(institution_type);`);

  // ============================================================
  // 4. TABLE CANDIDATES
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS candidates (
      id SERIAL PRIMARY KEY,
      full_name VARCHAR(255) NOT NULL,
      first_name VARCHAR(150),
      last_name VARCHAR(150),
      bio TEXT,
      photo_url TEXT,
      current_party_id INTEGER REFERENCES parties(id) ON DELETE SET NULL,
      is_active BOOLEAN DEFAULT TRUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_candidates_party ON candidates(current_party_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_candidates_active ON candidates(is_active);`);

  // ============================================================
  // 5. TABLE BREAKDOWN_DIMENSIONS
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS breakdown_dimensions (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE NOT NULL,
      label VARCHAR(255) NOT NULL,
      dimension_type VARCHAR(30) NOT NULL CHECK (
        dimension_type IN (
          'political_party',
          'electoral_candidate',
          'economic_sector',
          'demographics',
          'general_custom'
        )
      ),
      allows_hierarchy BOOLEAN DEFAULT FALSE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_breakdown_dimensions_type ON breakdown_dimensions(dimension_type);`);

  // ============================================================
  // 6. TABLE BREAKDOWN_ITEMS
  // ============================================================
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS breakdown_items (
      id SERIAL PRIMARY KEY,
      dimension_id INTEGER NOT NULL REFERENCES breakdown_dimensions(id) ON DELETE RESTRICT,
      code VARCHAR(100) NOT NULL,
      label VARCHAR(255) NOT NULL,
      parent_id INTEGER REFERENCES breakdown_items(id) ON DELETE RESTRICT,
      party_id INTEGER REFERENCES parties(id) ON DELETE RESTRICT,
      candidate_id INTEGER REFERENCES candidates(id) ON DELETE RESTRICT,
      metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
      CONSTRAINT uq_breakdown_item_dim_code UNIQUE (dimension_id, code)
    );
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_breakdown_items_dim ON breakdown_items(dimension_id, code);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_breakdown_items_parent ON breakdown_items(parent_id);`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_breakdown_items_party ON breakdown_items(party_id) WHERE party_id IS NOT NULL;`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS idx_breakdown_items_candidate ON breakdown_items(candidate_id) WHERE candidate_id IS NOT NULL;`);

  // ============================================================
  // 7. TRIGGER D'INTÉGRITÉ DES DIMENSIONS
  // ============================================================
  pgm.sql(`
    CREATE OR REPLACE FUNCTION fn_validate_breakdown_item_integrity()
    RETURNS TRIGGER AS $$
    DECLARE
      v_dim_type VARCHAR(30);
    BEGIN
      SELECT dimension_type INTO v_dim_type FROM breakdown_dimensions WHERE id = NEW.dimension_id;

      IF v_dim_type IS NULL THEN
        RAISE EXCEPTION 'Dimension introuvable pour ID %', NEW.dimension_id
          USING ERRCODE = '23503';
      END IF;

      IF v_dim_type = 'political_party' THEN
        IF NEW.party_id IS NULL OR NEW.candidate_id IS NOT NULL THEN
          RAISE EXCEPTION 'Item de dimension parti politique : party_id est obligatoire et candidate_id doit être NULL.'
            USING ERRCODE = '23514';
        END IF;
      ELSIF v_dim_type = 'electoral_candidate' THEN
        IF NEW.candidate_id IS NULL THEN
          RAISE EXCEPTION 'Item de dimension candidat : candidate_id est obligatoire.'
            USING ERRCODE = '23514';
        END IF;
      ELSE
        IF NEW.party_id IS NOT NULL OR NEW.candidate_id IS NOT NULL THEN
          RAISE EXCEPTION 'Les dimensions sectorielles ou démographiques ne peuvent référencer ni parti ni candidat.'
            USING ERRCODE = '23514';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  pgm.sql(`
    CREATE TRIGGER trg_validate_breakdown_item
    BEFORE INSERT OR UPDATE ON breakdown_items
    FOR EACH ROW EXECUTE FUNCTION fn_validate_breakdown_item_integrity();
  `);

  // ============================================================
  // 8. INSERTION INITIALE DU RÉFÉRENTIEL DES RÉGIONS DU CAMEROUN
  // ============================================================
  pgm.sql(`
    -- Pays
    INSERT INTO territories (code, name, type, parent_id)
    VALUES ('CMR', 'Cameroun', 'country', NULL)
    ON CONFLICT (code) DO NOTHING;

    -- Les 10 régions officielles du Cameroun rattachées au pays
    INSERT INTO territories (code, name, type, parent_id)
    SELECT r.code, r.name, 'region', c.id
    FROM (
      VALUES
        ('CM-AD', 'Adamaoua'),
        ('CM-CE', 'Centre'),
        ('CM-ES', 'Est'),
        ('CM-EN', 'Extrême-Nord'),
        ('CM-LT', 'Littoral'),
        ('CM-NO', 'Nord'),
        ('CM-NW', 'Nord-Ouest'),
        ('CM-OU', 'Ouest'),
        ('CM-SU', 'Sud'),
        ('CM-SW', 'Sud-Ouest')
    ) AS r(code, name)
    CROSS JOIN (SELECT id FROM territories WHERE code = 'CMR') AS c
    ON CONFLICT (code) DO NOTHING;

    -- Dimensions standard
    INSERT INTO breakdown_dimensions (code, label, dimension_type, allows_hierarchy)
    VALUES 
      ('POL_PARTY', 'Partis politiques', 'political_party', FALSE),
      ('CANDIDATE', 'Candidats électoraux', 'electoral_candidate', FALSE),
      ('ECO_SECTOR', 'Secteurs économiques', 'economic_sector', TRUE),
      ('DEMO_AGE_GROUP', 'Tranches d''âge', 'demographics', FALSE),
      ('GENDER', 'Genre / Sexe', 'demographics', FALSE)
    ON CONFLICT (code) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  // Suppression dans l'ordre inverse des dépendances
  pgm.sql(`DROP TRIGGER IF EXISTS trg_validate_breakdown_item ON breakdown_items;`);
  pgm.sql(`DROP FUNCTION IF EXISTS fn_validate_breakdown_item_integrity;`);
  pgm.sql(`DROP TABLE IF EXISTS breakdown_items;`);
  pgm.sql(`DROP TABLE IF EXISTS breakdown_dimensions;`);
  pgm.sql(`DROP TABLE IF EXISTS candidates;`);
  pgm.sql(`DROP TABLE IF EXISTS data_sources;`);
  pgm.sql(`DROP TABLE IF EXISTS data_indicators;`);
  pgm.sql(`DROP TABLE IF EXISTS territories;`);
};
