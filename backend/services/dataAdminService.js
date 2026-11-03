'use strict';

const pool = require('../config/database');

/**
 * Service métier pour l'API d'administration et le workflow éditorial Solitiquo DATA (Lot 2B)
 * Gère le cycle de vie complet des observations statistiques avec contrôle transactionnel strict,
 * verrous pessimistes (SELECT FOR UPDATE) contre les accès concurrents,
 * et respect des contraintes d'intégrité de la base de données.
 */

const ALLOWED_TRANSITIONS = {
  draft: ['under_review'],
  under_review: ['methodologically_validated', 'rejected', 'draft'],
  methodologically_validated: ['published', 'rejected', 'under_review'],
  rejected: ['draft', 'under_review'],
  published: ['superseded', 'revoked', 'archived'],
  superseded: ['archived'],
  revoked: [],
  archived: []
};

// Champs complets pour la vue d'administration (inclut les notes et métadonnées d'audit)
const ADMIN_VALUE_FIELDS = `
  dv.id,
  dv.indicator_id,
  di.code AS indicator_code,
  di.name AS indicator_name,
  di.unit AS indicator_unit,
  di.category AS indicator_category,
  di.description AS indicator_description,
  di.calculation_formula AS indicator_calculation_formula,
  di.producer_institution AS indicator_producer_institution,
  di.methodological_limitations AS indicator_methodological_limitations,
  di.subdomain AS indicator_subdomain,
  dv.territory_id,
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
  dv.editorial_status,
  dv.is_active,
  dv.revision_number,
  dv.supersedes_id,
  dv.superseded_by_id,
  dv.public_reason_summary,
  dv.internal_notes,
  dv.methodology_notes,
  dv.audit_status,
  dv.audit_caveat,
  dv.survey_or_account_status,
  dv.school_year,
  dv.audit_decision,
  dv.audit_decision_by,
  u_auditor.username AS audit_decision_by_username,
  dv.audit_decision_at,
  dv.audit_decision_notes,
  dv.audit_evidence_url,
  dv.audit_evidence_reference,
  dv.created_by,
  u_creator.username AS created_by_username,
  dv.validated_by,
  u_validator.username AS validated_by_username,
  dv.published_by,
  u_publisher.username AS published_by_username,
  dv.published_at,
  dv.created_at,
  dv.updated_at
`;

// Sous-requête pour agréger les sources (avec created_by et notes)
const ADMIN_SOURCES_SUBQUERY = `
  COALESCE(
    (
      SELECT json_agg(json_build_object(
        'id', dvs.id,
        'source_id', dvs.source_id,
        'source_name', ds.name,
        'source_acronym', ds.acronym,
        'source_role', dvs.source_role,
        'documentary_tier', dvs.documentary_tier,
        'citation_reference', dvs.citation_reference,
        'citation_url', dvs.citation_url,
        'methodological_robustness', dvs.methodological_robustness,
        'notes', dvs.notes,
        'created_by', dvs.created_by,
        'created_at', dvs.created_at
      ) ORDER BY CASE WHEN dvs.source_role = 'primary' THEN 1 ELSE 2 END, dvs.id ASC)
      FROM data_value_sources dvs
      JOIN data_sources ds ON ds.id = dvs.source_id
      WHERE dvs.data_value_id = dv.id
    ),
    '[]'::json
  ) AS sources
`;

// Sous-requête pour agréger les ventilations
const ADMIN_BREAKDOWNS_SUBQUERY = `
  COALESCE(
    (
      SELECT json_agg(json_build_object(
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
        'electoral_party_acronym', p.acronym,
        'notes', dvb.notes,
        'created_at', dvb.created_at
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
 * 1. Créer une nouvelle observation en brouillon (draft)
 */
async function createDraft(data, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Valider indicateur et territoire
    const indCheck = await client.query('SELECT id, is_active FROM data_indicators WHERE id = $1', [data.indicator_id]);
    if (indCheck.rows.length === 0 || !indCheck.rows[0].is_active) {
      throw { status: 400, message: 'Indicateur invalide ou inactif' };
    }

    const terCheck = await client.query('SELECT id FROM territories WHERE id = $1', [data.territory_id]);
    if (terCheck.rows.length === 0) {
      throw { status: 400, message: 'Territoire invalide' };
    }

    const sql = `
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, value_text, missing_reason, methodology_nature,
        editorial_status, is_active, revision_number,
        internal_notes, methodology_notes, public_reason_summary,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        'draft', FALSE, 1,
        $10, $11, $12,
        $13
      ) RETURNING id;
    `;

    const res = await client.query(sql, [
      data.indicator_id,
      data.territory_id,
      data.period_type,
      data.period_start,
      data.period_end,
      data.value_numeric !== undefined ? data.value_numeric : null,
      data.value_text || null,
      data.missing_reason || null,
      data.methodology_nature,
      data.internal_notes || null,
      data.methodology_notes || null,
      data.public_reason_summary || null,
      userId
    ]);

    const newId = res.rows[0].id;

    // Ajout éventuel de sources initiales
    if (Array.isArray(data.sources) && data.sources.length > 0) {
      for (const src of data.sources) {
        await client.query(`
          INSERT INTO data_value_sources (
            data_value_id, source_id, source_role, documentary_tier,
            citation_reference, citation_url, methodological_robustness, notes, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          newId,
          src.source_id,
          src.source_role || 'primary',
          src.documentary_tier || 'TIER_1_OFFICIAL',
          src.citation_reference,
          src.citation_url || null,
          src.methodological_robustness || 'high',
          src.notes || null,
          userId
        ]);
      }
    }

    // Ajout éventuel de ventilations initiales
    if (Array.isArray(data.breakdowns) && data.breakdowns.length > 0) {
      for (const b of data.breakdowns) {
        await client.query(`
          INSERT INTO data_value_breakdowns (
            data_value_id, breakdown_item_id, value_numeric, percentage, rank, electoral_party_id, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          newId,
          b.breakdown_item_id,
          b.value_numeric,
          b.percentage !== undefined ? b.percentage : null,
          b.rank || null,
          b.electoral_party_id || null,
          b.notes || null
        ]);
      }
    }

    await client.query('COMMIT');
    return await getAdminValueById(newId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 2. Récupérer le détail complet d'administration par ID
 */
async function getAdminValueById(id) {
  const sql = `
    SELECT 
      ${ADMIN_VALUE_FIELDS},
      ${ADMIN_SOURCES_SUBQUERY},
      ${ADMIN_BREAKDOWNS_SUBQUERY}
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    JOIN territories t ON t.id = dv.territory_id
    LEFT JOIN users u_creator ON u_creator.id = dv.created_by
    LEFT JOIN users u_validator ON u_validator.id = dv.validated_by
    LEFT JOIN users u_publisher ON u_publisher.id = dv.published_by
    LEFT JOIN users u_auditor ON u_auditor.id = dv.audit_decision_by
    WHERE dv.id = $1;
  `;
  const { rows } = await pool.query(sql, [id]);
  return rows[0] || null;
}

/**
 * 3. Lister les observations pour l'administration (avec filtres de statut, indicateur, etc.)
 */
async function listAdminValues(filters = {}) {
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(filters.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];

  if (filters.editorial_status && filters.editorial_status !== 'all') {
    if (filters.editorial_status.includes(',')) {
      const statuses = filters.editorial_status.split(',').map(s => s.trim()).filter(Boolean);
      params.push(statuses);
      conditions.push(`dv.editorial_status = ANY($${params.length})`);
    } else {
      params.push(filters.editorial_status);
      conditions.push(`dv.editorial_status = $${params.length}`);
    }
  }

  if (filters.audit_status && filters.audit_status !== 'all') {
    params.push(filters.audit_status);
    conditions.push(`dv.audit_status = $${params.length}`);
  }

  if (filters.audit_decision && filters.audit_decision !== 'all') {
    params.push(filters.audit_decision);
    conditions.push(`dv.audit_decision = $${params.length}`);
  }

  if (filters.indicator_id) {
    params.push(parseInt(filters.indicator_id, 10));
    conditions.push(`dv.indicator_id = $${params.length}`);
  }

  if (filters.indicator_code) {
    params.push(filters.indicator_code);
    conditions.push(`di.code = $${params.length}`);
  }

  if (filters.pilot_only === 'true' || filters.pilot_only === true) {
    conditions.push(`dv.id BETWEEN 687 AND 710`);
  }

  if (filters.territory_id) {
    params.push(parseInt(filters.territory_id, 10));
    conditions.push(`dv.territory_id = $${params.length}`);
  }

  if (filters.created_by) {
    params.push(parseInt(filters.created_by, 10));
    conditions.push(`dv.created_by = $${params.length}`);
  }

  if (filters.exclude_tests === 'true' || filters.exclude_tests === true) {
    conditions.push(`NOT (
      di.code ~ '^IND_(API|INACT|UI|WF|MIG[0-9]|TEST|[0-9]{10,})'
      OR di.name ILIKE '%test%'
      OR di.name ILIKE '%workflow%'
      OR di.name ILIKE '%mig3%'
      OR COALESCE(dv.internal_notes, '') ILIKE '%simulation%'
      OR COALESCE(dv.public_reason_summary, '') ILIKE '%demonstration%'
      OR COALESCE(dv.public_reason_summary, '') ILIKE '%démonstration%'
    )`);
  }

  if (filters.q && filters.q.trim()) {
    params.push(`%${filters.q.trim()}%`);
    const qIdx = params.length;
    conditions.push(`(di.name ILIKE $${qIdx} OR di.code ILIKE $${qIdx} OR t.name ILIKE $${qIdx} OR t.code ILIKE $${qIdx})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
      ${ADMIN_VALUE_FIELDS},
      ${ADMIN_SOURCES_SUBQUERY},
      ${ADMIN_BREAKDOWNS_SUBQUERY}
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    JOIN territories t ON t.id = dv.territory_id
    LEFT JOIN users u_creator ON u_creator.id = dv.created_by
    LEFT JOIN users u_validator ON u_validator.id = dv.validated_by
    LEFT JOIN users u_publisher ON u_publisher.id = dv.published_by
    LEFT JOIN users u_auditor ON u_auditor.id = dv.audit_decision_by
    ${whereClause}
    ORDER BY dv.updated_at DESC, dv.id DESC
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
 * 4. Modifier une observation non publiée
 */
async function updateValue(id, data, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verrou pessimiste
    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [id]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: `Observation introuvable : ${id}` };
    }

    const current = checkRes.rows[0];

    // Vérification des droits : admin ou auteur du brouillon
    if (user.role !== 'admin' && current.created_by !== user.id) {
      throw { status: 403, message: 'Accès interdit : vous ne pouvez modifier que vos propres observations' };
    }

    // Interdiction stricte de modifier sur place une observation publiée ou archivée
    if (['published', 'superseded', 'archived', 'revoked'].includes(current.editorial_status)) {
      throw {
        status: 400,
        message: `Impossible de modifier directement une observation au statut '${current.editorial_status}'. Utilisez la révision.`
      };
    }

    // Construction dynamique de la mise à jour
    const fields = [];
    const params = [id];

    const updatable = [
      'period_type', 'period_start', 'period_end',
      'value_numeric', 'value_text', 'missing_reason',
      'methodology_nature', 'internal_notes', 'methodology_notes', 'public_reason_summary'
    ];

    for (const key of updatable) {
      if (data[key] !== undefined) {
        params.push(data[key]);
        fields.push(`${key} = $${params.length}`);
      }
    }

    if (fields.length > 0) {
      fields.push(`updated_at = NOW()`);
      const updateSql = `UPDATE data_values SET ${fields.join(', ')} WHERE id = $1`;
      await client.query(updateSql, params);
    }

    await client.query('COMMIT');
    return await getAdminValueById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 5. Gestion des sources : ajouter une source
 */
async function addSource(valueId, sourceData, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [valueId]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const current = checkRes.rows[0];

    if (user.role !== 'admin' && current.created_by !== user.id) {
      throw { status: 403, message: 'Accès interdit sur cette observation' };
    }

    if (['published', 'superseded', 'archived', 'revoked'].includes(current.editorial_status)) {
      throw { status: 400, message: 'Impossible de modifier les sources d\'une observation publiée/archivée sur place' };
    }

    // Vérifier source_id
    const srcCheck = await client.query('SELECT id FROM data_sources WHERE id = $1', [sourceData.source_id]);
    if (srcCheck.rows.length === 0) {
      throw { status: 400, message: 'Source documentaire inexistante' };
    }

    const insertSql = `
      INSERT INTO data_value_sources (
        data_value_id, source_id, source_role, documentary_tier,
        citation_reference, citation_url, methodological_robustness, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id;
    `;

    const insRes = await client.query(insertSql, [
      valueId,
      sourceData.source_id,
      sourceData.source_role || 'primary',
      sourceData.documentary_tier || 'TIER_1_OFFICIAL',
      sourceData.citation_reference,
      sourceData.citation_url || null,
      sourceData.methodological_robustness || 'high',
      sourceData.notes || null,
      user.id
    ]);

    await client.query('COMMIT');
    return { success: true, source_id: insRes.rows[0].id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 6. Gestion des sources : retirer une source
 */
async function removeSource(valueId, sourceRecordId, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [valueId]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const current = checkRes.rows[0];

    if (user.role !== 'admin' && current.created_by !== user.id) {
      throw { status: 403, message: 'Accès interdit' };
    }

    if (['published', 'superseded', 'archived', 'revoked'].includes(current.editorial_status)) {
      throw { status: 400, message: 'Impossible de retirer des sources d\'une observation publiée' };
    }

    const delRes = await client.query(
      'DELETE FROM data_value_sources WHERE id = $1 AND data_value_id = $2 RETURNING id',
      [sourceRecordId, valueId]
    );

    if (delRes.rows.length === 0) {
      throw { status: 404, message: 'Source introuvable pour cette observation' };
    }

    await client.query('COMMIT');
    return { success: true, removed: sourceRecordId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 7. Gestion des ventilations : ajouter une ventilation
 */
async function addBreakdown(valueId, breakdownData, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [valueId]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const current = checkRes.rows[0];

    if (user.role !== 'admin' && current.created_by !== user.id) {
      throw { status: 403, message: 'Accès interdit' };
    }

    if (['published', 'superseded', 'archived', 'revoked'].includes(current.editorial_status)) {
      throw { status: 400, message: 'Impossible de modifier les ventilations d\'une observation publiée' };
    }

    const insSql = `
      INSERT INTO data_value_breakdowns (
        data_value_id, breakdown_item_id, value_numeric, percentage, rank, electoral_party_id, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id;
    `;

    const insRes = await client.query(insSql, [
      valueId,
      breakdownData.breakdown_item_id,
      breakdownData.value_numeric,
      breakdownData.percentage !== undefined ? breakdownData.percentage : null,
      breakdownData.rank || null,
      breakdownData.electoral_party_id || null,
      breakdownData.notes || null
    ]);

    await client.query('COMMIT');
    return { success: true, breakdown_id: insRes.rows[0].id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 8. Gestion des ventilations : supprimer une ventilation
 */
async function removeBreakdown(valueId, breakdownId, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [valueId]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const current = checkRes.rows[0];

    if (user.role !== 'admin' && current.created_by !== user.id) {
      throw { status: 403, message: 'Accès interdit' };
    }

    if (['published', 'superseded', 'archived', 'revoked'].includes(current.editorial_status)) {
      throw { status: 400, message: 'Impossible de supprimer les ventilations d\'une observation publiée' };
    }

    const delRes = await client.query(
      'DELETE FROM data_value_breakdowns WHERE id = $1 AND data_value_id = $2 RETURNING id',
      [breakdownId, valueId]
    );

    if (delRes.rows.length === 0) {
      throw { status: 404, message: 'Ventilation introuvable pour cette observation' };
    }

    await client.query('COMMIT');
    return { success: true, removed: breakdownId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 9. Soumettre une observation à validation (draft -> under_review)
 */
async function submitForReview(id, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [id]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const current = checkRes.rows[0];

    if (user.role !== 'admin' && current.created_by !== user.id) {
      throw { status: 403, message: 'Accès interdit sur cette observation' };
    }

    if (!ALLOWED_TRANSITIONS[current.editorial_status]?.includes('under_review')) {
      throw {
        status: 400,
        message: `Transition interdite : impossible de soumettre depuis le statut '${current.editorial_status}'`
      };
    }

    // Vérifier la présence d'au moins une source principale
    const srcCount = await client.query(
      "SELECT COUNT(*) AS count FROM data_value_sources WHERE data_value_id = $1 AND source_role = 'primary'",
      [id]
    );
    if (parseInt(srcCount.rows[0].count, 10) === 0) {
      throw {
        status: 400,
        message: 'Soumission refusée : l\'observation doit comporter au moins une source documentaire principale (source_role = primary)'
      };
    }

    await client.query(
      "UPDATE data_values SET editorial_status = 'under_review', updated_at = NOW() WHERE id = $1",
      [id]
    );

    await client.query('COMMIT');
    return await getAdminValueById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 10. Valider méthodologiquement une observation (under_review -> methodologically_validated)
 */
async function validateMethodology(id, validationNotes, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Réservé aux administrateurs
    if (user.role !== 'admin') {
      throw { status: 403, message: 'Accès refusé : la validation méthodologique est réservée aux administrateurs' };
    }

    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [id]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const current = checkRes.rows[0];

    if (!ALLOWED_TRANSITIONS[current.editorial_status]?.includes('methodologically_validated')) {
      throw {
        status: 400,
        message: `Transition interdite : impossible de valider depuis le statut '${current.editorial_status}' (statut attendu : under_review)`
      };
    }

    // Contrôle d'intégrité de l'audit 3C.1 : interdiction formelle si l'audit est refusé ou non accepté
    if (current.audit_decision === 'rejected') {
      throw {
        status: 400,
        message: "Validation méthodologique impossible : l'audit préalable de cette observation a été formellement refusé"
      };
    }
    if (current.audit_status && ['confirmed', 'confirmed_with_caveat', 'discrepancy'].includes(current.audit_status) && current.audit_decision !== 'accepted') {
      throw {
        status: 400,
        message: `Validation méthodologique impossible : le résultat d'audit (${current.audit_status}) doit être formellement accepté avant validation (décision actuelle : '${current.audit_decision}')`
      };
    }

    // Vérification de source primaire
    const srcCount = await client.query(
      "SELECT COUNT(*) AS count FROM data_value_sources WHERE data_value_id = $1 AND source_role = 'primary'",
      [id]
    );
    if (parseInt(srcCount.rows[0].count, 10) === 0) {
      throw {
        status: 400,
        message: 'Validation impossible : l\'observation doit comporter au moins une source primaire'
      };
    }

    let notes = current.internal_notes || '';
    if (validationNotes) {
      notes += `\n[Validation ${new Date().toISOString()} par ${user.username || user.id}]: ${validationNotes}`;
    }

    await client.query(`
      UPDATE data_values 
      SET editorial_status = 'methodologically_validated',
          validated_by = $2,
          internal_notes = $3,
          updated_at = NOW()
      WHERE id = $1
    `, [id, user.id, notes.trim()]);

    await client.query('COMMIT');
    return await getAdminValueById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 11. Rejeter une observation avec motif obligatoire
 */
async function rejectValue(id, rejectionReason, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (user.role !== 'admin') {
      throw { status: 403, message: 'Accès refusé : le rejet est réservé aux administrateurs' };
    }

    if (!rejectionReason || typeof rejectionReason !== 'string' || rejectionReason.trim().length < 5) {
      throw { status: 400, message: 'Un motif de rejet explicite (au moins 5 caractères) est obligatoire' };
    }

    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [id]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const current = checkRes.rows[0];

    if (!ALLOWED_TRANSITIONS[current.editorial_status]?.includes('rejected')) {
      throw {
        status: 400,
        message: `Transition interdite : impossible de rejeter depuis le statut '${current.editorial_status}'`
      };
    }

    let notes = current.internal_notes || '';
    notes += `\n[Rejet ${new Date().toISOString()} par ${user.username || user.id}]: ${rejectionReason.trim()}`;

    await client.query(`
      UPDATE data_values 
      SET editorial_status = 'rejected',
          internal_notes = $2,
          updated_at = NOW()
      WHERE id = $1
    `, [id, notes.trim()]);

    await client.query('COMMIT');
    return await getAdminValueById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 11b. Décider sur l'audit 3C.1 (Accepter ou Refuser le résultat de l'audit)
 */
async function decideAudit(id, { decision, notes, evidence_url, evidence_reference }, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (user.role !== 'admin') {
      throw { status: 403, message: 'Accès refusé : la décision sur l\'audit est réservée aux administrateurs' };
    }

    const ALLOWED_DECISIONS = ['accepted', 'rejected', 'correction_requested', 'pending_evidence'];
    if (!ALLOWED_DECISIONS.includes(decision)) {
      throw { status: 400, message: `Décision invalide. Valeurs acceptées : ${ALLOWED_DECISIONS.join(', ')}` };
    }

    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [id]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const current = checkRes.rows[0];

    // Contrôles des motifs obligatoires
    const trimmedNotes = (notes || '').trim();
    if (decision === 'rejected' && trimmedNotes.length < 5) {
      throw { status: 400, message: "Un motif obligatoire (au moins 5 caractères) est requis pour refuser l'audit" };
    }
    if (decision === 'correction_requested' && trimmedNotes.length < 5) {
      throw { status: 400, message: "Un motif obligatoire (au moins 5 caractères) est requis pour demander une correction" };
    }
    if (decision === 'pending_evidence' && trimmedNotes.length < 5) {
      throw { status: 400, message: "Un motif obligatoire (au moins 5 caractères) explicitant la preuve manquante est requis pour maintenir en attente" };
    }

    const justification = trimmedNotes.length > 0
      ? trimmedNotes
      : (decision === 'accepted' ? 'Résultat de l\'audit 3C.1 validé et accepté par la commission.' : 'Décision d\'audit enregistrée.');

    const newEditorialStatus = (decision === 'correction_requested') ? 'draft' : current.editorial_status;
    const actionName = (decision === 'correction_requested')
      ? 'REQUEST_CORRECTION'
      : (decision === 'pending_evidence' ? 'KEEP_PENDING' : 'AUDIT_DECISION');

    await client.query(`
      UPDATE data_values
      SET audit_decision = $2,
          audit_decision_by = $3,
          audit_decision_at = NOW(),
          audit_decision_notes = $4,
          editorial_status = $5,
          audit_evidence_url = COALESCE($6, audit_evidence_url),
          audit_evidence_reference = COALESCE($7, audit_evidence_reference),
          updated_at = NOW()
      WHERE id = $1;
    `, [
      id,
      decision,
      user.id,
      justification,
      newEditorialStatus,
      evidence_url || null,
      evidence_reference || null
    ]);

    // Journalisation explicite dans data_value_audit_log
    const diffPayload = {
      audit_decision: decision,
      reason: justification,
      evidence_url: evidence_url || null,
      evidence_reference: evidence_reference || null,
      previous_state: {
        editorial_status: current.editorial_status,
        audit_decision: current.audit_decision
      },
      new_state: {
        editorial_status: newEditorialStatus,
        audit_decision: decision
      }
    };

    await client.query(`
      INSERT INTO data_value_audit_log (
        data_value_id, action, old_status, new_status, reason, diff_payload, performed_by, performed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW());
    `, [
      id,
      actionName,
      current.editorial_status,
      newEditorialStatus,
      justification,
      JSON.stringify(diffPayload),
      user.id
    ]);

    await client.query('COMMIT');
    return await getAdminValueById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 11c. Demander une correction méthodologique ou documentaire (under_review -> draft)
 */
async function requestCorrection(id, correctionNotes, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (user.role !== 'admin') {
      throw { status: 403, message: 'Accès refusé : la demande de correction est réservée aux administrateurs' };
    }

    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [id]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const current = checkRes.rows[0];

    if (!ALLOWED_TRANSITIONS[current.editorial_status]?.includes('draft')) {
      throw {
        status: 400,
        message: `Transition interdite : impossible de demander une correction depuis le statut '${current.editorial_status}' (statut attendu : under_review)`
      };
    }

    const reason = (correctionNotes && typeof correctionNotes === 'string' && correctionNotes.trim().length >= 5)
      ? correctionNotes.trim()
      : 'Demande formelle de correction méthodologique ou documentaire.';

    let notes = current.internal_notes || '';
    notes += `\n[Correction demandée ${new Date().toISOString()} par ${user.username || user.id}]: ${reason}`;

    await client.query(`
      UPDATE data_values 
      SET editorial_status = 'draft',
          internal_notes = $2,
          updated_at = NOW()
      WHERE id = $1
    `, [id, notes.trim()]);

    // Journalisation explicite dans data_value_audit_log garantissant la traçabilité de l'auteur et du motif
    await client.query(`
      INSERT INTO data_value_audit_log (
        data_value_id, action, old_status, new_status, reason, diff_payload, performed_by, performed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW());
    `, [
      id,
      'REQUEST_CORRECTION',
      current.editorial_status,
      'draft',
      reason,
      JSON.stringify({ editorial_status: { old: current.editorial_status, new: 'draft' }, correction_notes: reason }),
      user.id
    ]);

    await client.query('COMMIT');
    return await getAdminValueById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 12. Publier une observation méthodologiquement validée
 */
async function publishValue(id, publicReasonSummary, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (user.role !== 'admin') {
      throw { status: 403, message: 'Publication réservée aux administrateurs' };
    }

    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [id]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const current = checkRes.rows[0];

    if (!ALLOWED_TRANSITIONS[current.editorial_status]?.includes('published')) {
      throw {
        status: 400,
        message: `Transition interdite : l'observation doit être au statut 'methodologically_validated' avant publication (statut actuel: '${current.editorial_status}')`
      };
    }

    // Sécurité stricte : interdiction absolue de publier une observation refusée ou dont l'audit est refusé
    if (current.editorial_status === 'rejected' || current.audit_decision === 'rejected') {
      throw {
        status: 400,
        message: "Publication impossible : l'observation ou son audit préalable a été refusé"
      };
    }

    // Condition 1 : L'audit doit avoir été formellement accepté si l'observation a fait l'objet d'un audit
    if (current.audit_status && current.audit_decision !== 'accepted') {
      throw {
        status: 400,
        message: `Publication impossible : l'audit préalable de l'observation doit être formellement accepté avant publication (décision actuelle : '${current.audit_decision}')`
      };
    }

    // Condition 2 : Vérifier la présence obligatoire et la complétude de la source primaire
    const srcRes = await client.query(
      "SELECT citation_reference FROM data_value_sources WHERE data_value_id = $1 AND source_role = 'primary'",
      [id]
    );
    if (srcRes.rows.length === 0) {
      throw {
        status: 400,
        message: 'Publication refusée : au moins une source principale est obligatoire'
      };
    }
    const primCitation = srcRes.rows[0].citation_reference;
    if (!primCitation || primCitation.trim().length < 10) {
      throw {
        status: 400,
        message: 'Publication refusée : la source principale doit comporter une référence bibliographique précise'
      };
    }

    // Condition 3 : Vérifier que les réserves sont correctement renseignées pour les séries avec réserve
    if (current.audit_status === 'confirmed_with_caveat' && (!current.audit_caveat || current.audit_caveat.trim().length === 0)) {
      throw {
        status: 400,
        message: 'Publication refusée : les réserves méthodologiques doivent être obligatoirement renseignées pour une observation avec réserve'
      };
    }

    // Si cette observation remplace une observation antérieure (révision),
    // basculer atomiquement l'ancienne observation en statut 'superseded' et is_active = FALSE
    if (current.supersedes_id) {
      await client.query(`
        UPDATE data_values
        SET editorial_status = 'superseded',
            is_active = FALSE,
            superseded_by_id = $1,
            updated_at = NOW()
        WHERE id = $2 AND editorial_status = 'published';
      `, [id, current.supersedes_id]);
    }

    // Publication de l'observation courante
    await client.query(`
      UPDATE data_values 
      SET editorial_status = 'published',
          is_active = TRUE,
          published_by = $2,
          published_at = NOW(),
          public_reason_summary = COALESCE($3, public_reason_summary),
          updated_at = NOW()
      WHERE id = $1
    `, [id, user.id, publicReasonSummary || null]);

    await client.query('COMMIT');
    return await getAdminValueById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 13. Créer une nouvelle révision d'une observation publiée
 * Clone l'observation en une nouvelle ligne 'draft', incrémente revision_number,
 * et clone ses sources et ventilations.
 */
async function createRevision(id, reason, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verrou pessimiste sur l'observation à réviser
    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [id]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const original = checkRes.rows[0];

    if (original.editorial_status !== 'published') {
      throw {
        status: 400,
        message: `Seule une observation publiée peut être révisée (statut actuel: '${original.editorial_status}')`
      };
    }

    // Vérifier s'il n'y a pas déjà une révision en cours non publiée
    const pendingRev = await client.query(
      "SELECT id FROM data_values WHERE supersedes_id = $1 AND editorial_status NOT IN ('superseded', 'revoked')",
      [id]
    );
    if (pendingRev.rows.length > 0) {
      throw {
        status: 409,
        message: `Une révision est déjà en cours pour cette observation (ID: ${pendingRev.rows[0].id})`
      };
    }

    const nextRevNumber = (original.revision_number || 1) + 1;

    // Création de la révision en 'draft'
    const insertSql = `
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, value_text, missing_reason, methodology_nature,
        editorial_status, is_active, revision_number, supersedes_id,
        public_reason_summary, internal_notes, methodology_notes,
        created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        'draft', FALSE, $10, $11,
        $12, $13, $14,
        $15
      ) RETURNING id;
    `;

    const insRes = await client.query(insertSql, [
      original.indicator_id,
      original.territory_id,
      original.period_type,
      original.period_start,
      original.period_end,
      original.value_numeric,
      original.value_text,
      original.missing_reason,
      original.methodology_nature,
      nextRevNumber,
      id,
      reason || `Révision R${nextRevNumber} de l'observation #${id}`,
      `[Création révision R${nextRevNumber} par ${user.username || user.id}]`,
      original.methodology_notes,
      user.id
    ]);

    const newRevId = insRes.rows[0].id;

    // Cloner les sources associées
    const sources = await client.query(
      'SELECT source_id, source_role, documentary_tier, citation_reference, citation_url, methodological_robustness, notes FROM data_value_sources WHERE data_value_id = $1',
      [id]
    );
    for (const s of sources.rows) {
      await client.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, citation_url, methodological_robustness, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        newRevId,
        s.source_id,
        s.source_role,
        s.documentary_tier,
        s.citation_reference,
        s.citation_url,
        s.methodological_robustness,
        s.notes,
        user.id
      ]);
    }

    // Cloner les ventilations associées
    const breakdowns = await client.query(
      'SELECT breakdown_item_id, value_numeric, percentage, rank, electoral_party_id, notes FROM data_value_breakdowns WHERE data_value_id = $1',
      [id]
    );
    for (const b of breakdowns.rows) {
      await client.query(`
        INSERT INTO data_value_breakdowns (
          data_value_id, breakdown_item_id, value_numeric, percentage, rank, electoral_party_id, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        newRevId,
        b.breakdown_item_id,
        b.value_numeric,
        b.percentage,
        b.rank,
        b.electoral_party_id,
        b.notes
      ]);
    }

    await client.query('COMMIT');
    return await getAdminValueById(newRevId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 14. Révoquer une observation publiée
 */
async function revokeValue(id, reason, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (user.role !== 'admin') {
      throw { status: 403, message: 'La révocation est strictement réservée aux administrateurs' };
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      throw { status: 400, message: 'Un motif public de révocation explicite (au moins 5 caractères) est obligatoire' };
    }

    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [id]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const current = checkRes.rows[0];

    if (!ALLOWED_TRANSITIONS[current.editorial_status]?.includes('revoked')) {
      throw {
        status: 400,
        message: `Transition interdite : impossible de révoquer une observation au statut '${current.editorial_status}' (statut attendu: published)`
      };
    }

    let notes = current.internal_notes || '';
    notes += `\n[Révocation ${new Date().toISOString()} par ${user.username || user.id}]: ${reason.trim()}`;

    await client.query(`
      UPDATE data_values 
      SET editorial_status = 'revoked',
          is_active = FALSE,
          public_reason_summary = $2,
          internal_notes = $3,
          updated_at = NOW()
      WHERE id = $1
    `, [id, reason.trim(), notes.trim()]);

    await client.query('COMMIT');
    return await getAdminValueById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 15. Archiver une observation (statut superseded ou published)
 */
async function archiveValue(id, user) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (user.role !== 'admin') {
      throw { status: 403, message: 'L\'archivage est réservé aux administrateurs' };
    }

    const checkRes = await client.query('SELECT * FROM data_values WHERE id = $1 FOR UPDATE', [id]);
    if (checkRes.rows.length === 0) {
      throw { status: 404, message: 'Observation introuvable' };
    }
    const current = checkRes.rows[0];

    if (!ALLOWED_TRANSITIONS[current.editorial_status]?.includes('archived')) {
      throw {
        status: 400,
        message: `Transition interdite : impossible d'archiver depuis le statut '${current.editorial_status}'`
      };
    }

    await client.query(`
      UPDATE data_values 
      SET editorial_status = 'archived',
          is_active = FALSE,
          updated_at = NOW()
      WHERE id = $1
    `, [id]);

    await client.query('COMMIT');
    return await getAdminValueById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * 16. Statistiques globales réelles du tableau de bord DATA
 */
async function getStats(options = {}) {
  const excludeTests = options.exclude_tests === 'true' || options.exclude_tests === true;
  const testFilterValues = excludeTests
    ? `JOIN data_indicators di ON di.id = dv.indicator_id WHERE NOT (
        di.code ~ '^IND_(API|INACT|UI|WF|MIG[0-9]|TEST|[0-9]{10,})'
        OR di.name ILIKE '%test%'
        OR di.name ILIKE '%workflow%'
        OR di.name ILIKE '%mig3%'
        OR COALESCE(dv.internal_notes, '') ILIKE '%simulation%'
        OR COALESCE(dv.public_reason_summary, '') ILIKE '%demonstration%'
        OR COALESCE(dv.public_reason_summary, '') ILIKE '%démonstration%'
      )`
    : '';
  const testFilterAudit = excludeTests
    ? `WHERE (di.code IS NULL OR NOT (
        di.code ~ '^IND_(API|INACT|UI|WF|MIG[0-9]|TEST|[0-9]{10,})'
        OR di.name ILIKE '%test%'
        OR di.name ILIKE '%workflow%'
        OR di.name ILIKE '%mig3%'
        OR COALESCE(al.reason, '') ILIKE '%test%'
        OR COALESCE(al.reason, '') ILIKE '%simulation%'
      ))`
    : '';
  const testFilterPub = excludeTests
    ? `AND NOT (
        di.code ~ '^IND_(API|INACT|UI|WF|MIG[0-9]|TEST|[0-9]{10,})'
        OR di.name ILIKE '%test%'
        OR di.name ILIKE '%workflow%'
        OR di.name ILIKE '%mig3%'
        OR COALESCE(dv.internal_notes, '') ILIKE '%simulation%'
        OR COALESCE(dv.public_reason_summary, '') ILIKE '%demonstration%'
        OR COALESCE(dv.public_reason_summary, '') ILIKE '%démonstration%'
      )`
    : '';

  const countsSql = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE dv.editorial_status = 'draft')::int AS draft_count,
      COUNT(*) FILTER (WHERE dv.editorial_status = 'under_review')::int AS under_review_count,
      COUNT(*) FILTER (WHERE dv.editorial_status = 'methodologically_validated')::int AS validated_count,
      COUNT(*) FILTER (WHERE dv.editorial_status = 'published')::int AS published_count,
      COUNT(*) FILTER (WHERE dv.editorial_status = 'revoked')::int AS revoked_count,
      COUNT(*) FILTER (WHERE dv.editorial_status = 'superseded')::int AS superseded_count,
      COUNT(*) FILTER (WHERE dv.editorial_status = 'archived')::int AS archived_count
    FROM data_values dv
    ${testFilterValues};
  `;
  const countsRes = await pool.query(countsSql);

  const recentActivitySql = `
    SELECT 
      al.id,
      al.data_value_id,
      al.action,
      al.old_status,
      al.new_status,
      al.reason,
      al.performed_at,
      u.username AS performed_by_username,
      di.code AS indicator_code,
      di.name AS indicator_name,
      t.code AS territory_code
    FROM data_value_audit_log al
    LEFT JOIN users u ON u.id = al.performed_by
    LEFT JOIN data_values dv ON dv.id = al.data_value_id
    LEFT JOIN data_indicators di ON di.id = dv.indicator_id
    LEFT JOIN territories t ON t.id = dv.territory_id
    ${testFilterAudit}
    ORDER BY al.performed_at DESC
    LIMIT 10;
  `;
  const activityRes = await pool.query(recentActivitySql);

  const recentPubSql = `
    SELECT 
      dv.id,
      di.code AS indicator_code,
      di.name AS indicator_name,
      t.code AS territory_code,
      t.name AS territory_name,
      dv.value_numeric,
      dv.value_text,
      dv.period_start,
      dv.period_end,
      dv.published_at,
      u.username AS published_by_username
    FROM data_values dv
    JOIN data_indicators di ON di.id = dv.indicator_id
    JOIN territories t ON t.id = dv.territory_id
    LEFT JOIN users u ON u.id = dv.published_by
    WHERE dv.editorial_status = 'published' AND dv.is_active = TRUE
    ${testFilterPub}
    ORDER BY dv.published_at DESC
    LIMIT 5;
  `;
  const recentPubRes = await pool.query(recentPubSql);

  return {
    counts: countsRes.rows[0] || {
      total: 0,
      draft_count: 0,
      under_review_count: 0,
      validated_count: 0,
      published_count: 0,
      revoked_count: 0,
      superseded_count: 0,
      archived_count: 0
    },
    recentActivity: activityRes.rows,
    recentPublications: recentPubRes.rows
  };
}

/**
 * 17. Historique complet et versions d'une observation
 */
async function getValueHistory(id) {
  const versionsSql = `
    SELECT 
      dvv.id,
      dvv.data_value_id,
      dvv.revision_number,
      dvv.period_type,
      dvv.period_start,
      dvv.period_end,
      dvv.value_numeric,
      dvv.value_text,
      dvv.missing_reason,
      dvv.methodology_nature,
      dvv.editorial_status,
      dvv.public_reason_summary,
      dvv.published_at,
      u_pub.username AS published_by_username,
      dvv.recorded_at,
      dvv.sources_snapshot,
      dvv.breakdowns_snapshot
    FROM data_value_versions dvv
    LEFT JOIN users u_pub ON u_pub.id = dvv.published_by
    WHERE dvv.data_value_id = $1
    ORDER BY dvv.revision_number DESC;
  `;
  const versionsRes = await pool.query(versionsSql, [id]);

  const auditSql = `
    SELECT 
      al.id,
      al.action,
      al.old_status,
      al.new_status,
      al.reason,
      al.diff_payload,
      al.performed_by,
      al.performed_at,
      u.username AS performed_by_username
    FROM data_value_audit_log al
    LEFT JOIN users u ON u.id = al.performed_by
    WHERE al.data_value_id = $1
    ORDER BY al.performed_at DESC;
  `;
  const auditRes = await pool.query(auditSql, [id]);

  return {
    versions: versionsRes.rows,
    auditTrail: auditRes.rows,
    audit_log: auditRes.rows
  };
}

/**
 * 18. Référentiels des ventilations (dimensions & catégories)
 */
async function getBreakdownReferentials() {
  const sql = `
    SELECT 
      bd.id AS dimension_id,
      bd.code AS dimension_code,
      bd.label AS dimension_label,
      bd.dimension_type,
      bi.id AS item_id,
      bi.code AS item_code,
      bi.label AS item_label
    FROM breakdown_dimensions bd
    JOIN breakdown_items bi ON bi.dimension_id = bd.id
    ORDER BY bd.label ASC, bi.label ASC;
  `;
  const { rows } = await pool.query(sql);

  // Regrouper par dimension
  const dimensionsMap = new Map();
  for (const row of rows) {
    if (!dimensionsMap.has(row.dimension_id)) {
      dimensionsMap.set(row.dimension_id, {
        id: row.dimension_id,
        code: row.dimension_code,
        label: row.dimension_label,
        type: row.dimension_type,
        items: []
      });
    }
    dimensionsMap.get(row.dimension_id).items.push({
      id: row.item_id,
      code: row.item_code,
      label: row.item_label
    });
  }

  return Array.from(dimensionsMap.values());
}

/**
 * 19. Journal d'audit global Solitiquo DATA
 */
async function getGlobalAuditLog(filters = {}) {
  const page = Math.max(1, parseInt(filters.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];

  if (filters.action) {
    params.push(filters.action);
    conditions.push(`al.action = $${params.length}`);
  }

  if (filters.data_value_id) {
    params.push(parseInt(filters.data_value_id, 10));
    conditions.push(`al.data_value_id = $${params.length}`);
  }

  if (filters.exclude_tests === 'true' || filters.exclude_tests === true) {
    conditions.push(`(di.code IS NULL OR NOT (
      di.code ~ '^IND_(API|INACT|UI|WF|MIG[0-9]|TEST|[0-9]{10,})'
      OR di.name ILIKE '%test%'
      OR di.name ILIKE '%workflow%'
      OR di.name ILIKE '%mig3%'
      OR COALESCE(al.reason, '') ILIKE '%test%'
      OR COALESCE(al.reason, '') ILIKE '%simulation%'
    ))`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `
    SELECT COUNT(*) AS total
    FROM data_value_audit_log al
    LEFT JOIN data_values dv ON dv.id = al.data_value_id
    LEFT JOIN data_indicators di ON di.id = dv.indicator_id
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
      al.id,
      al.data_value_id,
      al.action,
      al.old_status,
      al.new_status,
      al.reason,
      al.diff_payload AS metadata,
      al.performed_at,
      u.username AS performed_by_username,
      di.code AS indicator_code,
      di.name AS indicator_name,
      t.code AS territory_code,
      t.name AS territory_name
    FROM data_value_audit_log al
    LEFT JOIN users u ON u.id = al.performed_by
    LEFT JOIN data_values dv ON dv.id = al.data_value_id
    LEFT JOIN data_indicators di ON di.id = dv.indicator_id
    LEFT JOIN territories t ON t.id = dv.territory_id
    ${whereClause}
    ORDER BY al.performed_at DESC
    LIMIT $${limitIndex} OFFSET $${offsetIndex};
  `;
  const { rows } = await pool.query(dataSql, params);

  return {
    items: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * 20. Sources documentaires avec statistiques d'utilisation
 */
async function getSourcesWithStats() {
  const sql = `
    SELECT 
      s.id,
      s.name,
      s.acronym,
      s.institution_type,
      s.website_url,
      s.description,
      COUNT(DISTINCT dvs.data_value_id)::int AS observations_count,
      COUNT(DISTINCT dv.indicator_id)::int AS indicators_count
    FROM data_sources s
    LEFT JOIN data_value_sources dvs ON dvs.source_id = s.id
    LEFT JOIN data_values dv ON dv.id = dvs.data_value_id
    GROUP BY s.id, s.name, s.acronym, s.institution_type, s.website_url, s.description
    ORDER BY observations_count DESC, s.name ASC;
  `;
  const { rows } = await pool.query(sql);
  return rows;
}

module.exports = {
  createDraft,
  getAdminValueById,
  listAdminValues,
  updateValue,
  addSource,
  removeSource,
  addBreakdown,
  removeBreakdown,
  submitForReview,
  validateMethodology,
  rejectValue,
  decideAudit,
  requestCorrection,
  publishValue,
  createRevision,
  revokeValue,
  archiveValue,
  getStats,
  getValueHistory,
  getBreakdownReferentials,
  getGlobalAuditLog,
  getSourcesWithStats
};
