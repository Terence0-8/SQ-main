'use strict';

const pool = require('../config/database');

/**
 * Service métier pour l'API publique Solitiquo DATA
 * Garantit l'accès exclusif aux données publiées et actives (editorial_status = 'published' AND is_active = TRUE)
 * Aucune fuite d'informations internes ou de métadonnées privées d'administration.
 */

// Colonnes publiques de base pour une observation
const DATA_VALUE_BASE_FIELDS = `
  dv.id,
  di.code AS indicator_code,
  di.name AS indicator_name,
  di.unit AS indicator_unit,
  di.category AS indicator_category,
  t.code AS territory_code,
  t.name AS territory_name,
  t.type AS territory_type,
  dv.period_type,
  dv.period_start,
  dv.period_end,
  dv.value_numeric,
  dv.value_text,
  dv.missing_reason,
  dv.methodology_nature,
  dv.revision_number,
  dv.supersedes_id,
  dv.superseded_by_id,
  dv.public_reason_summary,
  dv.methodology_notes,
  dv.published_at
`;

// Sous-requête SQL pour agréger les sources documentaires publiques
const SOURCES_SUBQUERY = `
  COALESCE(
    (
      SELECT json_agg(json_build_object(
        'source_id', dvs.source_id,
        'source_name', ds.name,
        'source_acronym', ds.acronym,
        'source_role', dvs.source_role,
        'documentary_tier', dvs.documentary_tier,
        'citation_reference', dvs.citation_reference,
        'citation_url', dvs.citation_url,
        'methodological_robustness', dvs.methodological_robustness,
        'notes', dvs.notes
      ) ORDER BY CASE WHEN dvs.source_role = 'primary' THEN 1 ELSE 2 END, dvs.id ASC)
      FROM data_value_sources dvs
      JOIN data_sources ds ON ds.id = dvs.source_id
      WHERE dvs.data_value_id = dv.id
    ),
    '[]'::json
  ) AS sources
`;

// Sous-requête SQL pour agréger les ventilations publiques
const BREAKDOWNS_SUBQUERY = `
  COALESCE(
    (
      SELECT json_agg(json_build_object(
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
        'electoral_party_acronym', p.acronym,
        'electoral_party_color', p.color,
        'notes', dvb.notes
      ) ORDER BY dvb.rank ASC NULLS LAST, dvb.id ASC)
      FROM data_value_breakdowns dvb
      JOIN breakdown_items bi ON bi.id = dvb.breakdown_item_id
      JOIN breakdown_dimensions bd ON bd.id = bi.dimension_id
      LEFT JOIN parties p ON p.id = dvb.electoral_party_id
      WHERE dvb.data_value_id = dv.id
    ),
    '[]'::json
  ) AS breakdowns
`;

/**
 * 1. Liste des territoires
 */
async function getTerritories({ type, parentCode } = {}) {
  const conditions = [];
  const params = [];

  if (type) {
    params.push(type);
    conditions.push(`t.type = $${params.length}`);
  }

  if (parentCode) {
    params.push(parentCode);
    conditions.push(`parent.code = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      t.id,
      t.code,
      t.name,
      t.type,
      t.parent_id,
      parent.code AS parent_code,
      parent.name AS parent_name,
      t.geom_geojson
    FROM territories t
    LEFT JOIN territories parent ON parent.id = t.parent_id
    ${whereClause}
    ORDER BY 
      CASE t.type
        WHEN 'country' THEN 1
        WHEN 'region' THEN 2
        WHEN 'department' THEN 3
        WHEN 'arrondissement' THEN 4
        WHEN 'constituency' THEN 5
        WHEN 'municipality' THEN 6
        ELSE 7
      END,
      t.name ASC;
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Récupère un territoire par son code
 */
async function getTerritoryByCode(code) {
  const sql = `
    SELECT 
      t.id,
      t.code,
      t.name,
      t.type,
      t.parent_id,
      parent.code AS parent_code,
      parent.name AS parent_name,
      t.geom_geojson
    FROM territories t
    LEFT JOIN territories parent ON parent.id = t.parent_id
    WHERE UPPER(t.code) = UPPER($1);
  `;
  const { rows } = await pool.query(sql, [code]);
  return rows[0] || null;
}

/**
 * 2. Liste des indicateurs publics
 */
async function getIndicators({ category, domain, subdomain, status, definition_status } = {}) {
  const conditions = [];
  const params = [];

  // Par défaut, retourner les indicateurs actifs si aucun statut n'est spécifié
  if (status) {
    params.push(status);
    conditions.push(`di.status = $${params.length}`);
  } else {
    conditions.push('di.is_active = TRUE');
  }

  const cat = category || domain;
  if (cat) {
    params.push(cat);
    conditions.push(`di.category = $${params.length}`);
  }

  if (subdomain) {
    params.push(subdomain);
    conditions.push(`di.subdomain = $${params.length}`);
  }

  if (definition_status) {
    params.push(definition_status);
    conditions.push(`di.definition_status = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      di.id,
      di.code,
      di.name,
      di.short_name,
      di.description,
      di.category,
      di.subdomain,
      di.unit,
      di.data_nature,
      di.calculation_formula,
      di.expected_periodicity,
      di.geographical_levels,
      di.producer_institution,
      di.potential_sources,
      di.methodological_limitations,
      di.availability_start_year,
      di.definition_status,
      di.status,
      di.is_active
    FROM data_indicators di
    ${whereClause}
    ORDER BY di.category ASC, di.name ASC;
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Récupère un indicateur par son code
 */
async function getIndicatorByCode(code, { onlyActive = false } = {}) {
  const activeClause = onlyActive ? ' AND di.is_active = TRUE' : '';
  const sql = `
    SELECT 
      di.id,
      di.code,
      di.name,
      di.short_name,
      di.description,
      di.category,
      di.subdomain,
      di.unit,
      di.data_nature,
      di.calculation_formula,
      di.expected_periodicity,
      di.geographical_levels,
      di.producer_institution,
      di.potential_sources,
      di.methodological_limitations,
      di.availability_start_year,
      di.definition_status,
      di.status,
      di.metadata,
      di.is_active,
      di.created_at,
      di.updated_at
    FROM data_indicators di
    WHERE UPPER(di.code) = UPPER($1)${activeClause};
  `;
  const { rows } = await pool.query(sql, [code]);
  return rows[0] || null;
}

/**
 * 3. Liste des sources documentaires
 */
async function getSources({ institutionType } = {}) {
  const conditions = [];
  const params = [];

  if (institutionType) {
    params.push(institutionType);
    conditions.push(`ds.institution_type = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      ds.id,
      ds.name,
      ds.acronym,
      ds.institution_type,
      ds.website_url,
      ds.description
    FROM data_sources ds
    ${whereClause}
    ORDER BY ds.name ASC;
  `;

  const { rows } = await pool.query(sql, params);
  return rows;
}

/**
 * Construit dynamiquement les filtres SQL pour les requêtes sur les valeurs
 */
function buildValueFilters(filters, params, initialConditions = []) {
  const conditions = [...initialConditions];

  // Toujours et obligatoirement restreint aux observations publiées et actives
  conditions.push("dv.editorial_status = 'published'");
  conditions.push("dv.is_active = TRUE");

  if (filters.territoryCode) {
    params.push(filters.territoryCode);
    conditions.push(`UPPER(t.code) = UPPER($${params.length})`);
  }

  if (filters.indicatorCode) {
    params.push(filters.indicatorCode);
    conditions.push(`UPPER(di.code) = UPPER($${params.length})`);
  }

  if (filters.category) {
    params.push(filters.category);
    conditions.push(`di.category = $${params.length}`);
  }

  if (filters.periodType) {
    params.push(filters.periodType);
    conditions.push(`UPPER(dv.period_type) = UPPER($${params.length})`);
  }

  if (filters.year) {
    params.push(filters.year);
    conditions.push(`EXTRACT(YEAR FROM dv.period_start) = $${params.length}`);
  }

  if (filters.periodStart) {
    params.push(filters.periodStart);
    conditions.push(`dv.period_start >= $${params.length}`);
  }

  if (filters.periodEnd) {
    params.push(filters.periodEnd);
    conditions.push(`dv.period_end <= $${params.length}`);
  }

  if (filters.methodologyNature) {
    params.push(filters.methodologyNature);
    conditions.push(`LOWER(dv.methodology_nature) = LOWER($${params.length})`);
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
}

/**
 * 4. Recherche paginée des valeurs pour un indicateur
 */
async function getIndicatorValues(indicatorCode, filters = {}) {
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const params = [indicatorCode];
  const whereClause = buildValueFilters(filters, params, [`UPPER(di.code) = UPPER($1)`]);

  // Total pour pagination
  const countSql = `
    SELECT COUNT(*) AS total
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    JOIN territories t ON t.id = dv.territory_id
    ${whereClause};
  `;
  const countRes = await pool.query(countSql, params);
  const total = parseInt(countRes.rows[0].total, 10);

  // Requête de données paginées
  params.push(limit);
  const limitIndex = params.length;
  params.push(offset);
  const offsetIndex = params.length;

  const dataSql = `
    SELECT 
      ${DATA_VALUE_BASE_FIELDS},
      ${SOURCES_SUBQUERY},
      ${BREAKDOWNS_SUBQUERY}
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    JOIN territories t ON t.id = dv.territory_id
    ${whereClause}
    ORDER BY dv.period_start DESC, t.name ASC
    LIMIT $${limitIndex} OFFSET $${offsetIndex};
  `;

  const { rows } = await pool.query(dataSql, params);

  return {
    data: rows,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      total_pages: Math.ceil(total / limit) || 1
    }
  };
}

/**
 * 5. Recherche paginée des valeurs pour un territoire
 */
async function getTerritoryValues(territoryCode, filters = {}) {
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const params = [territoryCode];
  const whereClause = buildValueFilters(filters, params, [`UPPER(t.code) = UPPER($1)`]);

  const countSql = `
    SELECT COUNT(*) AS total
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    JOIN territories t ON t.id = dv.territory_id
    ${whereClause};
  `;
  const countRes = await pool.query(countSql, params);
  const total = parseInt(countRes.rows[0].total, 10);

  params.push(limit);
  const limitIndex = params.length;
  params.push(offset);
  const offsetIndex = params.length;

  const dataSql = `
    SELECT 
      ${DATA_VALUE_BASE_FIELDS},
      ${SOURCES_SUBQUERY},
      ${BREAKDOWNS_SUBQUERY}
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    JOIN territories t ON t.id = dv.territory_id
    ${whereClause}
    ORDER BY dv.period_start DESC, di.name ASC
    LIMIT $${limitIndex} OFFSET $${offsetIndex};
  `;

  const { rows } = await pool.query(dataSql, params);

  return {
    data: rows,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      total_pages: Math.ceil(total / limit) || 1
    }
  };
}

/**
 * 6. Détail complet d'une observation spécifique par son ID
 * Seules les observations publiées (ou archivées/remplacées de l'historique) sont retournées.
 * Les brouillons ('draft', 'under_review') et les données rejetées/révoquées sont strictement inaccessibles.
 */
async function getValueById(id) {
  const sql = `
    SELECT 
      ${DATA_VALUE_BASE_FIELDS},
      dv.editorial_status,
      ${SOURCES_SUBQUERY},
      ${BREAKDOWNS_SUBQUERY}
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    JOIN territories t ON t.id = dv.territory_id
    WHERE dv.id = $1
      AND dv.editorial_status IN ('published', 'superseded', 'archived');
  `;

  const { rows } = await pool.query(sql, [id]);
  if (rows.length === 0) return null;

  const value = rows[0];

  // Récupérer le fil des versions/révisions publiques associées via data_value_versions
  const revisionsSql = `
    SELECT 
      dvv.revision_number,
      dvv.public_reason_summary,
      dvv.published_at,
      dvv.recorded_at
    FROM data_value_versions dvv
    WHERE dvv.data_value_id = $1
    ORDER BY dvv.revision_number ASC;
  `;
  const revisionsRes = await pool.query(revisionsSql, [id]);
  value.revisions_history = revisionsRes.rows;

  return value;
}

module.exports = {
  getTerritories,
  getTerritoryByCode,
  getIndicators,
  getIndicatorByCode,
  getSources,
  getIndicatorValues,
  getTerritoryValues,
  getValueById
};
