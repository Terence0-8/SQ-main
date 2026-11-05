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
async function getIndicatorByCode(code, { onlyActive = false, includeDetails = true } = {}) {
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
  if (!rows[0]) return null;
  const indicator = rows[0];

  if (includeDetails) {
    // 1. Publications documentaires publiques rattachées
    const pubsSql = `
      SELECT 
        dp.id AS publication_id,
        dp.title,
        ds.name AS institution_name,
        ds.acronym AS institution_acronym,
        dp.publication_year,
        dp.document_category,
        dp.documentary_tier,
        dp.url,
        dp.bibliographic_reference,
        dp.verification_status,
        dpi.specific_section,
        dpi.notes
      FROM data_publication_indicators dpi
      JOIN data_publications dp ON dp.id = dpi.publication_id
      JOIN data_sources ds ON ds.id = dp.institution_id
      WHERE dpi.indicator_id = $1
      ORDER BY dp.publication_year DESC NULLS LAST, dp.id ASC;
    `;
    const pubsRes = await pool.query(pubsSql, [indicator.id]);
    indicator.publications = pubsRes.rows;

    // 2. Historique des observations publiées et actives uniquement (Lot 3D)
    const historySql = `
      SELECT 
        dv.id,
        dv.period_type,
        dv.period_start,
        dv.period_end,
        EXTRACT(YEAR FROM dv.period_start)::int AS period_year,
        dv.value_numeric,
        di.unit,
        t.code AS territory_code,
        t.name AS territory_name,
        t.type AS territory_type,
        dv.methodology_nature,
        CASE 
          WHEN dv.methodology_nature IN ('nowcast_estimate', 'projection') THEN TRUE 
          ELSE FALSE 
        END AS is_estimation,
        CASE 
          WHEN dv.methodology_nature IN ('nowcast_estimate', 'projection') THEN 'Estimation / Projection'
          ELSE 'Donnée définitive'
        END AS estimation_status_label,
        dv.public_reason_summary,
        dv.methodology_notes,
        dv.audit_caveat,
        dv.published_at,
        ${SOURCES_SUBQUERY}
      FROM data_values dv
      JOIN data_indicators di ON di.id = dv.indicator_id
      JOIN territories t ON t.id = dv.territory_id
      WHERE dv.indicator_id = $1
        AND dv.editorial_status = 'published'
        AND dv.is_active = TRUE
      ORDER BY dv.period_start ASC, t.code ASC;
    `;
    const historyRes = await pool.query(historySql, [indicator.id]);
    indicator.published_history = historyRes.rows.map(r => ({
      ...r,
      value_numeric: Number(r.value_numeric),
      period_start: r.period_start ? r.period_start.toISOString?.().slice(0, 10) || String(r.period_start).slice(0, 10) : null,
      period_end: r.period_end ? r.period_end.toISOString?.().slice(0, 10) || String(r.period_end).slice(0, 10) : null
    }));
  }

  return indicator;
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
      AND dv.editorial_status = 'published'
      AND dv.is_active = TRUE;
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

/**
 * 7. Recherche statistique publique (Lot 3D)
 * Recherche multi-critères dans les observations statistiques STRICTEMENT publiées et actives :
 * - editorial_status = 'published'
 * - is_active = TRUE
 * Exclusion absolue des brouillons, audits en cours, rejets, révocations et métadonnées internes.
 */
async function searchPublishedStatistics(params = {}) {
  const {
    q,
    indicator,
    indicator_code,
    territory,
    territory_code,
    category,
    domain,
    period_type,
    year,
    period_start,
    period_end,
    page = 1,
    limit = 20,
    sort = 'relevance'
  } = params;

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (safePage - 1) * safeLimit;

  const conditions = [
    "dv.editorial_status = 'published'",
    "dv.is_active = TRUE"
  ];
  const queryParams = [];

  // Recherche textuelle générale
  if (q && typeof q === 'string' && q.trim().length >= 2) {
    const term = `%${q.trim()}%`;
    queryParams.push(term);
    const qIndex = queryParams.length;
    conditions.push(`(
      di.name ILIKE $${qIndex} OR 
      di.code ILIKE $${qIndex} OR 
      di.description ILIKE $${qIndex} OR 
      di.category ILIKE $${qIndex} OR 
      t.name ILIKE $${qIndex} OR 
      t.code ILIKE $${qIndex}
    )`);
  }

  // Filtre indicateur (nom ou code)
  const indFilter = (indicator || indicator_code)?.trim();
  if (indFilter) {
    queryParams.push(`%${indFilter}%`);
    const idx = queryParams.length;
    conditions.push(`(di.code ILIKE $${idx} OR di.name ILIKE $${idx})`);
  }

  // Filtre territoire (nom ou code)
  const terrFilter = (territory || territory_code)?.trim();
  if (terrFilter) {
    queryParams.push(`%${terrFilter}%`);
    const idx = queryParams.length;
    conditions.push(`(t.code ILIKE $${idx} OR t.name ILIKE $${idx})`);
  }

  // Filtre domaine / catégorie
  const catFilter = (category || domain)?.trim();
  if (catFilter) {
    queryParams.push(catFilter);
    const idx = queryParams.length;
    conditions.push(`LOWER(di.category) = LOWER($${idx})`);
  }

  // Filtre type de période
  if (period_type?.trim()) {
    queryParams.push(period_type.trim().toUpperCase());
    const idx = queryParams.length;
    conditions.push(`UPPER(dv.period_type) = $${idx}`);
  }

  // Filtre année
  if (year) {
    const parsedYear = parseInt(year, 10);
    if (!isNaN(parsedYear)) {
      queryParams.push(parsedYear);
      const idx = queryParams.length;
      conditions.push(`EXTRACT(YEAR FROM dv.period_start) = $${idx}`);
    }
  }

  // Bornes temporelles
  if (period_start?.trim()) {
    queryParams.push(period_start.trim());
    const idx = queryParams.length;
    conditions.push(`dv.period_start >= $${idx}`);
  }

  if (period_end?.trim()) {
    queryParams.push(period_end.trim());
    const idx = queryParams.length;
    conditions.push(`dv.period_end <= $${idx}`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Clauses de tri
  let orderClause = 'ORDER BY dv.published_at DESC, dv.period_end DESC';
  if (sort === 'date_asc') {
    orderClause = 'ORDER BY dv.published_at ASC, dv.period_start ASC';
  } else if (sort === 'period_desc') {
    orderClause = 'ORDER BY dv.period_end DESC, dv.period_start DESC';
  } else if (sort === 'period_asc') {
    orderClause = 'ORDER BY dv.period_start ASC, dv.period_end ASC';
  } else if (sort === 'value_desc') {
    orderClause = 'ORDER BY dv.value_numeric DESC NULLS LAST';
  } else if (sort === 'value_asc') {
    orderClause = 'ORDER BY dv.value_numeric ASC NULLS LAST';
  } else if (sort === 'relevance' && q) {
    orderClause = `ORDER BY 
      CASE WHEN UPPER(di.code) = UPPER($1) THEN 1
           WHEN di.name ILIKE $1 THEN 2
           ELSE 3 END ASC,
      dv.period_end DESC`;
  }

  // Calcul du total
  const countSql = `
    SELECT COUNT(*) AS total
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    JOIN territories t ON t.id = dv.territory_id
    ${whereClause};
  `;
  const countRes = await pool.query(countSql, queryParams);
  const total = parseInt(countRes.rows[0].total, 10);

  // Données paginées
  queryParams.push(safeLimit);
  const limitIdx = queryParams.length;
  queryParams.push(offset);
  const offsetIdx = queryParams.length;

  const dataSql = `
    SELECT 
      dv.id,
      di.code AS indicator_code,
      di.name AS indicator_name,
      di.category AS indicator_category,
      di.unit,
      dv.value_numeric,
      dv.value_text,
      dv.period_type,
      dv.period_start,
      dv.period_end,
      EXTRACT(YEAR FROM dv.period_start)::int AS period_year,
      t.code AS territory_code,
      t.name AS territory_name,
      t.type AS territory_type,
      dv.methodology_nature,
      dv.methodology_notes,
      dv.public_reason_summary,
      dv.audit_caveat,
      dv.published_at,
      CASE 
        WHEN dv.methodology_nature IN ('nowcast_estimate', 'projection') THEN TRUE 
        ELSE FALSE 
      END AS is_estimation,
      ${SOURCES_SUBQUERY}
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    JOIN territories t ON t.id = dv.territory_id
    ${whereClause}
    ${orderClause}
    LIMIT $${limitIdx} OFFSET $${offsetIdx};
  `;

  const { rows } = await pool.query(dataSql, queryParams);

  const results = rows.map(r => ({
    id: r.id,
    indicator_code: r.indicator_code,
    indicator_name: r.indicator_name,
    indicator_category: r.indicator_category,
    value_numeric: Number(r.value_numeric),
    value_text: r.value_text,
    unit: r.unit,
    period_type: r.period_type,
    period_start: r.period_start ? (r.period_start.toISOString?.().slice(0, 10) || String(r.period_start).slice(0, 10)) : null,
    period_end: r.period_end ? (r.period_end.toISOString?.().slice(0, 10) || String(r.period_end).slice(0, 10)) : null,
    period_year: r.period_year,
    territory_code: r.territory_code,
    territory_name: r.territory_name,
    territory_type: r.territory_type,
    methodology_nature: r.methodology_nature,
    is_estimation: r.is_estimation,
    estimation_status_label: r.is_estimation ? 'Estimation / Projection' : 'Donnée définitive',
    methodology_notes: r.methodology_notes,
    public_reason_summary: r.public_reason_summary,
    audit_caveat: r.audit_caveat,
    published_at: r.published_at,
    detail_url: `/data.html#indicator-${r.indicator_code}`,
    sources: r.sources || []
  }));

  return {
    data: results,
    meta: {
      total,
      page: safePage,
      limit: safeLimit,
      total_pages: Math.ceil(total / safeLimit) || 1,
      totalPages: Math.ceil(total / safeLimit) || 1,
      query: q || null,
      filters: {
        indicator: indFilter || null,
        territory: terrFilter || null,
        category: catFilter || null,
        year: year || null,
        period_type: period_type || null
      }
    }
  };
}

/**
 * 8. Extraction pour Exports (CSV, JSON, JSON-LD)
 * Seules les observations publiées et actives sont récupérées (max 5000)
 */
async function exportPublishedObservations(params = {}) {
  const {
    indicator,
    indicator_code,
    territory,
    territory_code,
    category,
    domain,
    period_type,
    year,
    period_start,
    period_end,
    limit = 5000
  } = params;

  const conditions = [
    "dv.editorial_status = 'published'",
    "dv.is_active = TRUE"
  ];
  const queryParams = [];

  const indFilter = (indicator || indicator_code)?.trim();
  if (indFilter) {
    queryParams.push(`%${indFilter}%`);
    const idx = queryParams.length;
    conditions.push(`(di.code ILIKE $${idx} OR di.name ILIKE $${idx})`);
  }

  const terrFilter = (territory || territory_code)?.trim();
  if (terrFilter) {
    queryParams.push(`%${terrFilter}%`);
    const idx = queryParams.length;
    conditions.push(`(t.code ILIKE $${idx} OR t.name ILIKE $${idx})`);
  }

  const catFilter = (category || domain)?.trim();
  if (catFilter) {
    queryParams.push(catFilter);
    const idx = queryParams.length;
    conditions.push(`LOWER(di.category) = LOWER($${idx})`);
  }

  if (period_type?.trim()) {
    queryParams.push(period_type.trim().toUpperCase());
    const idx = queryParams.length;
    conditions.push(`UPPER(dv.period_type) = $${idx}`);
  }

  if (year) {
    const parsedYear = parseInt(year, 10);
    if (!isNaN(parsedYear)) {
      queryParams.push(parsedYear);
      const idx = queryParams.length;
      conditions.push(`EXTRACT(YEAR FROM dv.period_start) = $${idx}`);
    }
  }

  if (period_start?.trim()) {
    queryParams.push(period_start.trim());
    const idx = queryParams.length;
    conditions.push(`dv.period_start >= $${idx}`);
  }

  if (period_end?.trim()) {
    queryParams.push(period_end.trim());
    const idx = queryParams.length;
    conditions.push(`dv.period_end <= $${idx}`);
  }

  const safeLimit = Math.min(5000, Math.max(1, parseInt(limit, 10) || 5000));
  queryParams.push(safeLimit);
  const limitIdx = queryParams.length;

  const sql = `
    SELECT 
      dv.id,
      di.code AS indicator_code,
      di.name AS indicator_name,
      di.category AS indicator_category,
      di.unit,
      dv.value_numeric,
      dv.value_text,
      dv.period_type,
      dv.period_start,
      dv.period_end,
      EXTRACT(YEAR FROM dv.period_start)::int AS period_year,
      t.code AS territory_code,
      t.name AS territory_name,
      t.type AS territory_type,
      dv.methodology_nature,
      dv.methodology_notes,
      dv.public_reason_summary,
      dv.audit_caveat,
      dv.published_at,
      CASE 
        WHEN dv.methodology_nature IN ('nowcast_estimate', 'projection') THEN TRUE 
        ELSE FALSE 
      END AS is_estimation,
      ${SOURCES_SUBQUERY}
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    JOIN territories t ON t.id = dv.territory_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY dv.period_start ASC, di.code ASC, t.code ASC
    LIMIT $${limitIdx};
  `;

  const { rows } = await pool.query(sql, queryParams);

  return rows.map(r => ({
    id: r.id,
    indicator_code: r.indicator_code,
    indicator_name: r.indicator_name,
    indicator_category: r.indicator_category,
    value_numeric: Number(r.value_numeric),
    value_text: r.value_text,
    unit: r.unit,
    period_type: r.period_type,
    period_start: r.period_start ? (r.period_start.toISOString?.().slice(0, 10) || String(r.period_start).slice(0, 10)) : null,
    period_end: r.period_end ? (r.period_end.toISOString?.().slice(0, 10) || String(r.period_end).slice(0, 10)) : null,
    period_year: r.period_year,
    territory_code: r.territory_code,
    territory_name: r.territory_name,
    territory_type: r.territory_type,
    methodology_nature: r.methodology_nature,
    is_estimation: r.is_estimation,
    estimation_status_label: r.is_estimation ? 'Estimation / Projection' : 'Donnée définitive',
    methodology_notes: r.methodology_notes,
    public_reason_summary: r.public_reason_summary,
    audit_caveat: r.audit_caveat,
    published_at: r.published_at,
    sources: r.sources || []
  }));
}

/**
 * 9. Génération CSV (UTF-8 avec BOM, séparateur point-virgule, protection injection formules)
 */
function generateCsv(records) {
  const BOM = '\uFEFF';
  const headers = [
    'Code Indicateur',
    'Nom Indicateur',
    'Domaine',
    'Code Territoire',
    'Nom Territoire',
    'Type Territoire',
    'Type Période',
    'Année',
    'Date Début',
    'Date Fin',
    'Valeur',
    'Unité',
    'Nature Méthodologique',
    'Statut Chiffrage',
    'Réserves Méthodologiques',
    'Sources Publiques',
    'Date Publication',
    'Lien Fiche'
  ];

  const escapeCell = (val) => {
    if (val === null || val === undefined) return '""';
    let str = String(val).trim();
    // Neutralisation des formules dans Excel / LibreOffice
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };

  const rows = [headers.map(escapeCell).join(';')];

  for (const r of records) {
    const sourcesSummary = (r.sources || [])
      .map(s => {
        let citation = s.citation_reference ? String(s.citation_reference).trim() : '';
        if (/^[=+\-@\t\r]/.test(citation)) {
          citation = "'" + citation;
        }
        let txt = s.source_name || s.source_acronym || 'Source officielle';
        if (citation) txt += ` (${citation})`;
        return txt;
      })
      .join(' | ');

    const line = [
      escapeCell(r.indicator_code),
      escapeCell(r.indicator_name),
      escapeCell(r.indicator_category),
      escapeCell(r.territory_code),
      escapeCell(r.territory_name),
      escapeCell(r.territory_type),
      escapeCell(r.period_type),
      escapeCell(r.period_year),
      escapeCell(r.period_start),
      escapeCell(r.period_end),
      escapeCell(r.value_numeric !== null && !isNaN(r.value_numeric) ? String(r.value_numeric) : ''),
      escapeCell(r.unit),
      escapeCell(r.methodology_nature || ''),
      escapeCell(r.is_estimation ? 'Estimation / Projection' : 'Donnée définitive'),
      escapeCell(r.audit_caveat || r.methodology_notes || ''),
      escapeCell(sourcesSummary),
      escapeCell(r.published_at ? new Date(r.published_at).toISOString() : ''),
      escapeCell(`https://solitiquo.cm/data.html#indicator-${r.indicator_code}`)
    ];
    rows.push(line.join(';'));
  }

  return BOM + rows.join('\r\n');
}

/**
 * 10. Génération JSON classique structuré
 */
function generateJson(records, filters = {}) {
  return {
    success: true,
    meta: {
      format: 'json',
      exported_at: new Date().toISOString(),
      total_records: records.length,
      filters: filters || {},
      license: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Solitiquo DATA — Données Statistiques Officielles du Cameroun'
    },
    data: records
  };
}

/**
 * 11. Génération JSON-LD sémantique (Schema.org DataFeed / Observation)
 */
function generateJsonLd(records) {
  return {
    '@context': {
      '@vocab': 'https://schema.org/',
      'Observation': 'https://schema.org/Observation',
      'DataFeed': 'https://schema.org/DataFeed',
      'Dataset': 'https://schema.org/Dataset',
      'PropertyValue': 'https://schema.org/PropertyValue',
      'Place': 'https://schema.org/Place',
      'NewsMediaOrganization': 'https://schema.org/NewsMediaOrganization',
      'variableMeasured': 'https://schema.org/variableMeasured',
      'spatialCoverage': 'https://schema.org/spatialCoverage',
      'temporalCoverage': 'https://schema.org/temporalCoverage',
      'measurementTechnique': 'https://schema.org/measurementTechnique',
      'observationDate': 'https://schema.org/observationDate',
      'value': 'https://schema.org/value',
      'unitText': 'https://schema.org/unitText'
    },
    '@type': 'DataFeed',
    'name': 'Solitiquo DATA — Statistiques Publiques Officielles du Cameroun',
    'description': 'Corpus d\'observations statistiques certifiées et publiées par Solitiquo DATA avec réserves méthodologiques et traçabilité documentaire.',
    'publisher': {
      '@type': 'NewsMediaOrganization',
      'name': 'Solitiquo',
      'url': 'https://solitiquo.cm',
      'logo': 'https://solitiquo.cm/logo.svg'
    },
    'license': 'https://creativecommons.org/licenses/by/4.0/',
    'dateModified': new Date().toISOString(),
    'inLanguage': 'fr',
    'dataFeedElement': records.map(r => ({
      '@type': 'Observation',
      'identifier': `${r.indicator_code}-${r.territory_code}-${r.period_year || r.period_start || r.id}`,
      'name': `${r.indicator_name} (${r.territory_name}, ${r.period_year || r.period_start})`,
      'variableMeasured': {
        '@type': 'PropertyValue',
        'name': r.indicator_name,
        'propertyID': r.indicator_code,
        'unitText': r.unit
      },
      'value': Number(r.value_numeric),
      'observationDate': r.period_end || r.period_start,
      'temporalCoverage': `${r.period_start}/${r.period_end}`,
      'spatialCoverage': {
        '@type': 'Place',
        'name': r.territory_name,
        'identifier': r.territory_code
      },
      'measurementTechnique': r.methodology_nature || 'official_statistical_record',
      'description': r.public_reason_summary || r.methodology_notes || `Observation ${r.indicator_name} pour le territoire ${r.territory_name}`,
      'disambiguatingDescription': r.is_estimation ? 'Estimation ou projection statistique sujette à révision' : 'Donnée statistique consolidée',
      'citation': (r.sources || []).map(s => s.citation_reference || s.source_name).filter(Boolean),
      'url': `https://solitiquo.cm/data.html#indicator-${r.indicator_code}`
    }))
  };
}

module.exports = {
  getTerritories,
  getTerritoryByCode,
  getIndicators,
  getIndicatorByCode,
  getSources,
  getIndicatorValues,
  getTerritoryValues,
  getValueById,
  searchPublishedStatistics,
  exportPublishedObservations,
  generateCsv,
  generateJson,
  generateJsonLd
};
