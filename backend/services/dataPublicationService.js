'use strict';

/**
 * =============================================================================
 * SOLITIQUO DATA — SERVICE DU CORPUS DOCUMENTAIRE STATISTIQUE (LOT 3B)
 * =============================================================================
 */

const pool = require('../config/database');

/**
 * 1. Liste des publications avec filtres, recherche et pagination
 */
async function listPublications({
  institutionId,
  documentCategory,
  verificationStatus,
  indicatorCode,
  domain,
  search,
  page = 1,
  limit = 50
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  const conditions = [];
  const params = [];

  if (institutionId) {
    params.push(parseInt(institutionId, 10));
    conditions.push(`dp.institution_id = $${params.length}`);
  }

  if (documentCategory) {
    params.push(documentCategory);
    conditions.push(`dp.document_category = $${params.length}`);
  }

  if (verificationStatus) {
    params.push(verificationStatus);
    conditions.push(`dp.verification_status = $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    conditions.push(`(dp.title ILIKE $${params.length} OR dp.publisher_organization ILIKE $${params.length} OR dp.bibliographic_reference ILIKE $${params.length} OR dp.notes ILIKE $${params.length})`);
  }

  if (indicatorCode) {
    params.push(indicatorCode.toUpperCase());
    conditions.push(`dp.id IN (
      SELECT dpi.publication_id 
      FROM data_publication_indicators dpi
      JOIN data_indicators di ON di.id = dpi.indicator_id
      WHERE UPPER(di.code) = $${params.length}
    )`);
  }

  if (domain) {
    params.push(domain.toLowerCase());
    conditions.push(`dp.id IN (
      SELECT dpi.publication_id 
      FROM data_publication_indicators dpi
      JOIN data_indicators di ON di.id = dpi.indicator_id
      WHERE LOWER(di.category) = $${params.length}
    )`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Comptage total
  const countSql = `
    SELECT COUNT(*) AS total
    FROM data_publications dp
    ${whereClause};
  `;
  const countRes = await pool.query(countSql, params);
  const total = parseInt(countRes.rows[0].total, 10);
  const totalPages = Math.ceil(total / limitNum) || 1;

  // Sélection paginée avec jointure sur l'institution et agrégation JSON des indicateurs reliés
  const sql = `
    SELECT 
      dp.id,
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
      TO_CHAR(dp.consultation_date, 'YYYY-MM-DD') AS consultation_date,
      dp.verification_status,
      dp.notes,
      dp.created_at,
      dp.updated_at,
      json_build_object(
        'id', ds.id,
        'name', ds.name,
        'acronym', ds.acronym,
        'institution_type', ds.institution_type,
        'website_url', ds.website_url
      ) AS institution,
      COALESCE(
        json_agg(
          json_build_object(
            'id', di.id,
            'code', di.code,
            'name', di.name,
            'short_name', di.short_name,
            'category', di.category,
            'specific_section', dpi.specific_section
          ) ORDER BY di.category ASC, di.code ASC
        ) FILTER (WHERE di.id IS NOT NULL),
        '[]'::json
      ) AS indicators
    FROM data_publications dp
    JOIN data_sources ds ON ds.id = dp.institution_id
    LEFT JOIN data_publication_indicators dpi ON dpi.publication_id = dp.id
    LEFT JOIN data_indicators di ON di.id = dpi.indicator_id
    ${whereClause}
    GROUP BY dp.id, ds.id
    ORDER BY dp.publication_year DESC NULLS LAST, dp.id DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2};
  `;

  params.push(limitNum, offset);
  const { rows } = await pool.query(sql, params);

  return {
    publications: rows,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      total_pages: totalPages
    }
  };
}

/**
 * 2. Détail complet d'une publication par ID
 */
async function getPublicationById(id) {
  const pubId = parseInt(id, 10);
  if (isNaN(pubId) || pubId <= 0) return null;

  const sql = `
    SELECT 
      dp.id,
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
      TO_CHAR(dp.consultation_date, 'YYYY-MM-DD') AS consultation_date,
      dp.verification_status,
      dp.notes,
      dp.created_at,
      dp.updated_at,
      json_build_object(
        'id', ds.id,
        'name', ds.name,
        'acronym', ds.acronym,
        'institution_type', ds.institution_type,
        'website_url', ds.website_url
      ) AS institution,
      COALESCE(
        json_agg(
          json_build_object(
            'id', di.id,
            'code', di.code,
            'name', di.name,
            'short_name', di.short_name,
            'category', di.category,
            'subdomain', di.subdomain,
            'unit', di.unit,
            'specific_section', dpi.specific_section
          ) ORDER BY di.category ASC, di.code ASC
        ) FILTER (WHERE di.id IS NOT NULL),
        '[]'::json
      ) AS indicators
    FROM data_publications dp
    JOIN data_sources ds ON ds.id = dp.institution_id
    LEFT JOIN data_publication_indicators dpi ON dpi.publication_id = dp.id
    LEFT JOIN data_indicators di ON di.id = dpi.indicator_id
    WHERE dp.id = $1
    GROUP BY dp.id, ds.id;
  `;

  const { rows } = await pool.query(sql, [pubId]);
  return rows[0] || null;
}

/**
 * 3. Création d'une nouvelle publication documentaire
 */
async function createPublication(data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validation des champs obligatoires
    if (!data.title || !data.title.trim()) {
      throw { status: 400, message: 'Le titre exact de la publication est obligatoire' };
    }
    if (!data.institution_id) {
      throw { status: 400, message: 'L\'institution productrice (institution_id) est obligatoire' };
    }
    if (!data.document_category) {
      throw { status: 400, message: 'La catégorie documentaire (document_category) est obligatoire' };
    }
    if (!data.verification_status) {
      throw { status: 400, message: 'Le statut de vérification documentaire est obligatoire' };
    }

    const validCategories = [
      'census', 'survey', 'national_accounts', 'budget_law',
      'statistical_yearbook', 'administrative_report', 'periodic_bulletin',
      'demographic_projection', 'electoral_decision', 'academic_study',
      'international_database'
    ];
    if (!validCategories.includes(data.document_category)) {
      throw { status: 400, message: `Catégorie documentaire invalide : ${data.document_category}` };
    }

    const validStatuses = [
      'verified_consulted',
      'identified_unconsulted',
      'potential_to_search',
      'unavailable_or_broken',
      'institutional_reference_only',
      'unavailable'
    ];
    if (!validStatuses.includes(data.verification_status)) {
      throw { status: 400, message: `Statut de vérification invalide : ${data.verification_status}` };
    }

    // Règle Lot 3C.4 : Une URL institutionnelle ne prouve pas la consultation
    if (data.verification_status === 'verified_consulted') {
      if (!data.consultation_date || !data.bibliographic_reference || data.bibliographic_reference.trim().length < 5) {
        throw {
          status: 400,
          message: "Une publication ne peut pas être marquée 'verified_consulted' sans référence bibliographique complète et date de consultation formelle (une URL institutionnelle ne constitue pas une preuve de consultation)"
        };
      }
    }

    // Vérifier l'institution
    const instCheck = await client.query('SELECT id FROM data_sources WHERE id = $1', [data.institution_id]);
    if (instCheck.rows.length === 0) {
      throw { status: 400, message: `Institution productrice introuvable (ID: ${data.institution_id})` };
    }

    const validTiers = ['TIER_1_OFFICIAL', 'TIER_2_STATISTICAL', 'TIER_3_ACADEMIC_PEER', 'TIER_4_REPUTABLE_NGO', 'TIER_5_SECONDARY_PRESS'];
    let documentaryTier = data.documentary_tier ? String(data.documentary_tier).trim().toUpperCase() : null;
    if (documentaryTier && !validTiers.includes(documentaryTier)) {
      throw { status: 400, message: `Niveau documentaire invalide : ${data.documentary_tier}` };
    }
    if (!documentaryTier) {
      documentaryTier = 'TIER_2_STATISTICAL'; // Repli prudent par défaut, jamais TIER 1 automatique
    }

    const insertSql = `
      INSERT INTO data_publications (
        institution_id, title, publisher_organization, publication_year,
        coverage_period_start, coverage_period_end, document_category,
        documentary_tier, url, bibliographic_reference, geographical_coverage,
        consultation_date, verification_status, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING id;
    `;

    const pubRes = await client.query(insertSql, [
      data.institution_id,
      data.title.trim(),
      data.publisher_organization?.trim() || null,
      data.publication_year ? parseInt(data.publication_year, 10) : null,
      data.coverage_period_start?.trim() || null,
      data.coverage_period_end?.trim() || null,
      data.document_category,
      documentaryTier,
      data.url?.trim() || null,
      data.bibliographic_reference?.trim() || null,
      data.geographical_coverage?.trim() || 'national',
      data.consultation_date || null,
      data.verification_status,
      data.notes?.trim() || null
    ]);

    const publicationId = pubRes.rows[0].id;

    // Association des indicateurs reliés
    if (data.indicators && Array.isArray(data.indicators)) {
      for (const item of data.indicators) {
        const indId = typeof item === 'object' ? item.indicator_id || item.id : item;
        const section = typeof item === 'object' ? item.specific_section : null;
        if (indId) {
          await client.query(`
            INSERT INTO data_publication_indicators (publication_id, indicator_id, specific_section)
            VALUES ($1, $2, $3)
            ON CONFLICT (publication_id, indicator_id) DO UPDATE SET specific_section = EXCLUDED.specific_section;
          `, [publicationId, indId, section]);
        }
      }
    }

    await client.query('COMMIT');
    return getPublicationById(publicationId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 4. Mise à jour d'une publication
 */
async function updatePublication(id, data) {
  const pubId = parseInt(id, 10);
  if (isNaN(pubId) || pubId <= 0) {
    throw { status: 400, message: 'Identifiant de publication invalide' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingCheck = await client.query('SELECT * FROM data_publications WHERE id = $1 FOR UPDATE', [pubId]);
    if (existingCheck.rows.length === 0) {
      throw { status: 404, message: `Publication introuvable (ID: ${pubId})` };
    }

    const current = existingCheck.rows[0];

    // Vérification de la catégorie
    if (data.document_category) {
      const validCategories = [
        'census', 'survey', 'national_accounts', 'budget_law',
        'statistical_yearbook', 'administrative_report', 'periodic_bulletin',
        'demographic_projection', 'electoral_decision', 'academic_study',
        'international_database'
      ];
      if (!validCategories.includes(data.document_category)) {
        throw { status: 400, message: `Catégorie documentaire invalide : ${data.document_category}` };
      }
    }

    // Vérification du statut
    if (data.verification_status) {
      const validStatuses = [
      'verified_consulted',
      'identified_unconsulted',
      'potential_to_search',
      'unavailable_or_broken',
      'institutional_reference_only',
      'unavailable'
    ];
      if (!validStatuses.includes(data.verification_status)) {
        throw { status: 400, message: `Statut de vérification invalide : ${data.verification_status}` };
      }
    }

    const targetStatus = data.verification_status || current.verification_status;
    const targetBibRef = data.bibliographic_reference !== undefined ? data.bibliographic_reference : current.bibliographic_reference;
    const targetConsultDate = data.consultation_date !== undefined ? data.consultation_date : current.consultation_date;

    if (targetStatus === 'verified_consulted') {
      if (!targetConsultDate || !targetBibRef || targetBibRef.trim().length < 5) {
        throw {
          status: 400,
          message: "Une publication ne peut pas être marquée 'verified_consulted' sans référence bibliographique complète et date de consultation formelle (une URL institutionnelle ne constitue pas une preuve de consultation)"
        };
      }
    }

    const updateSql = `
      UPDATE data_publications
      SET
        institution_id = COALESCE($1, institution_id),
        title = COALESCE($2, title),
        publisher_organization = COALESCE($3, publisher_organization),
        publication_year = COALESCE($4, publication_year),
        coverage_period_start = COALESCE($5, coverage_period_start),
        coverage_period_end = COALESCE($6, coverage_period_end),
        document_category = COALESCE($7, document_category),
        documentary_tier = COALESCE($8, documentary_tier),
        url = COALESCE($9, url),
        bibliographic_reference = COALESCE($10, bibliographic_reference),
        geographical_coverage = COALESCE($11, geographical_coverage),
        consultation_date = COALESCE($12, consultation_date),
        verification_status = COALESCE($13, verification_status),
        notes = COALESCE($14, notes),
        updated_at = NOW()
      WHERE id = $15;
    `;

    await client.query(updateSql, [
      data.institution_id || null,
      data.title?.trim() || null,
      data.publisher_organization !== undefined ? (data.publisher_organization?.trim() || null) : null,
      data.publication_year !== undefined ? (parseInt(data.publication_year, 10) || null) : null,
      data.coverage_period_start !== undefined ? (data.coverage_period_start?.trim() || null) : null,
      data.coverage_period_end !== undefined ? (data.coverage_period_end?.trim() || null) : null,
      data.document_category || null,
      data.documentary_tier || null,
      data.url !== undefined ? (data.url?.trim() || null) : null,
      data.bibliographic_reference !== undefined ? (data.bibliographic_reference?.trim() || null) : null,
      data.geographical_coverage || null,
      data.consultation_date !== undefined ? (data.consultation_date || null) : null,
      data.verification_status || null,
      data.notes !== undefined ? (data.notes?.trim() || null) : null,
      pubId
    ]);

    // Remplacement des indicateurs si la liste est fournie
    if (data.indicators && Array.isArray(data.indicators)) {
      await client.query('DELETE FROM data_publication_indicators WHERE publication_id = $1', [pubId]);
      for (const item of data.indicators) {
        const indId = typeof item === 'object' ? item.indicator_id || item.id : item;
        const section = typeof item === 'object' ? item.specific_section : null;
        if (indId) {
          await client.query(`
            INSERT INTO data_publication_indicators (publication_id, indicator_id, specific_section)
            VALUES ($1, $2, $3)
            ON CONFLICT (publication_id, indicator_id) DO UPDATE SET specific_section = EXCLUDED.specific_section;
          `, [pubId, indId, section]);
        }
      }
    }

    await client.query('COMMIT');
    return getPublicationById(pubId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 5. Suppression d'une publication
 */
async function deletePublication(id) {
  const pubId = parseInt(id, 10);
  if (isNaN(pubId) || pubId <= 0) {
    throw { status: 400, message: 'Identifiant de publication invalide' };
  }

  const res = await pool.query('DELETE FROM data_publications WHERE id = $1 RETURNING id, title', [pubId]);
  if (res.rows.length === 0) {
    throw { status: 404, message: `Publication #${pubId} introuvable` };
  }
  return { success: true, deleted: res.rows[0] };
}

/**
 * 6. Statistiques globales du corpus documentaire et couverture des indicateurs
 */
async function getPublicationsStats() {
  const [statusRes, coverRes, totalIndRes] = await Promise.all([
    // Statistiques par statut de vérification
    pool.query(`
      SELECT 
        verification_status, 
        COUNT(*) AS count 
      FROM data_publications 
      GROUP BY verification_status;
    `),
    // Nombre d'indicateurs reliés à au moins une publication 'verified_consulted'
    pool.query(`
      SELECT COUNT(DISTINCT di.id) AS verified_covered_indicators
      FROM data_indicators di
      JOIN data_publication_indicators dpi ON dpi.indicator_id = di.id
      JOIN data_publications dp ON dp.id = dpi.publication_id
      WHERE dp.verification_status = 'verified_consulted' 
        AND di.is_active = TRUE;
    `),
    // Nombre d'indicateurs actifs du référentiel statistique (exclut les indicateurs éphémères de tests 'IND_%')
    pool.query(`
      SELECT COUNT(*) AS total_active_indicators
      FROM data_indicators
      WHERE is_active = TRUE 
        AND (short_name IS NOT NULL OR code NOT LIKE 'IND_%');
    `)
  ]);

  const statusCounts = {
    verified_consulted: 0,
    identified_unconsulted: 0,
    potential_to_search: 0,
    unavailable_or_broken: 0,
    total_publications: 0
  };

  for (const row of statusRes.rows) {
    const c = parseInt(row.count, 10);
    if (statusCounts[row.verification_status] !== undefined) {
      statusCounts[row.verification_status] = c;
    }
    statusCounts.total_publications += c;
  }

  const verifiedCoveredIndicators = parseInt(coverRes.rows[0]?.verified_covered_indicators || 0, 10);
  const totalActiveIndicators = parseInt(totalIndRes.rows[0]?.total_active_indicators || 0, 10);
  const uncoveredIndicatorsCount = Math.max(0, totalActiveIndicators - verifiedCoveredIndicators);

  return {
    publications: statusCounts,
    indicators: {
      total_active: totalActiveIndicators,
      verified_covered: verifiedCoveredIndicators,
      uncovered_or_unverified: uncoveredIndicatorsCount,
      coverage_rate_percent: totalActiveIndicators > 0 ? Number(((verifiedCoveredIndicators / totalActiveIndicators) * 100).toFixed(1)) : 0
    }
  };
}

/**
 * 7. Indicateurs actifs sans documentation vérifiée (orphelins de source primaire vérifiée)
 */
async function getUncoveredIndicators() {
  const sql = `
    SELECT 
      di.id,
      di.code,
      di.name,
      di.short_name,
      di.category,
      di.subdomain,
      di.unit,
      di.producer_institution,
      di.definition_status,
      COALESCE(
        json_agg(
          json_build_object(
            'publication_id', dp.id,
            'title', dp.title,
            'verification_status', dp.verification_status,
            'publication_year', dp.publication_year
          )
        ) FILTER (WHERE dp.id IS NOT NULL),
        '[]'::json
      ) AS partial_publications
    FROM data_indicators di
    LEFT JOIN data_publication_indicators dpi ON dpi.indicator_id = di.id
    LEFT JOIN data_publications dp ON dp.id = dpi.publication_id
    WHERE di.is_active = TRUE 
      AND di.id NOT IN (
        SELECT dpi_v.indicator_id 
        FROM data_publication_indicators dpi_v
        JOIN data_publications dp_v ON dp_v.id = dpi_v.publication_id
        WHERE dp_v.verification_status = 'verified_consulted'
      )
    GROUP BY di.id
    ORDER BY di.category ASC, di.code ASC;
  `;

  const { rows } = await pool.query(sql);
  return rows;
}

module.exports = {
  listPublications,
  getPublicationById,
  createPublication,
  updatePublication,
  deletePublication,
  getPublicationsStats,
  getUncoveredIndicators
};
