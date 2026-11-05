'use strict';

const dataAdminService = require('../services/dataAdminService');
const dataPublicationService = require('../services/dataPublicationService');

/**
 * Contrôleur pour l'API d'administration Solitiquo DATA (Lot 2B)
 * Gère la validation des requêtes, la sécurité des entrées et les réponses standardisées.
 */

const sendSuccess = (res, data, meta = null, status = 200) => {
  const payload = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
};

const sendError = (res, message, status = 400) => {
  return res.status(status).json({ success: false, error: message });
};

const parseId = (param) => {
  const id = parseInt(param, 10);
  if (isNaN(id) || id <= 0) return null;
  return id;
};

/**
 * POST /api/data/admin/values
 */
async function createDraft(req, res) {
  try {
    const {
      indicator_id,
      territory_id,
      period_type,
      period_start,
      period_end,
      value_numeric,
      value_text,
      missing_reason,
      methodology_nature,
      internal_notes,
      methodology_notes,
      public_reason_summary,
      sources,
      breakdowns
    } = req.body;

    if (!indicator_id || !territory_id || !period_type || !period_start || !period_end || !methodology_nature) {
      return sendError(res, 'Champs obligatoires manquants (indicator_id, territory_id, period_type, period_start, period_end, methodology_nature)');
    }

    // Contrainte exacte de valeur : numérique OU textuelle OU motif d'absence
    const hasNum = value_numeric !== undefined && value_numeric !== null && value_numeric !== '';
    const hasTxt = Boolean(value_text);
    const hasMissing = Boolean(missing_reason);

    const valCount = (hasNum ? 1 : 0) + (hasTxt ? 1 : 0) + (hasMissing ? 1 : 0);
    if (valCount !== 1) {
      return sendError(res, 'Spécifiez exactement une valeur numérique, ou une valeur textuelle, ou un motif d\'absence');
    }

    const created = await dataAdminService.createDraft({
      indicator_id: parseInt(indicator_id, 10),
      territory_id: parseInt(territory_id, 10),
      period_type: period_type.toUpperCase(),
      period_start,
      period_end,
      value_numeric: hasNum ? Number(value_numeric) : null,
      value_text: hasTxt ? String(value_text).trim() : null,
      missing_reason: hasMissing ? String(missing_reason).trim() : null,
      methodology_nature: String(methodology_nature).trim().toLowerCase(),
      internal_notes,
      methodology_notes,
      public_reason_summary,
      sources,
      breakdowns
    }, req.session.user.id);

    return sendSuccess(res, created, null, 201);
  } catch (err) {
    console.error('Erreur createDraft:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de la création du brouillon', status);
  }
}

/**
 * GET /api/data/admin/values
 */
async function listAdminValues(req, res) {
  try {
    const {
      editorial_status,
      indicator_id,
      territory_id,
      created_by,
      page,
      limit
    } = req.query;

    const result = await dataAdminService.listAdminValues({
      editorial_status,
      indicator_id,
      territory_id,
      created_by,
      page,
      limit
    });

    return sendSuccess(res, result.data, result.meta);
  } catch (err) {
    console.error('Erreur listAdminValues:', err);
    return sendError(res, 'Erreur lors de la liste des observations administratives', 500);
  }
}

/**
 * GET /api/data/admin/values/:id
 */
async function getAdminValueById(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const value = await dataAdminService.getAdminValueById(id);
    if (!value) return sendError(res, `Observation introuvable : ${id}`, 404);

    return sendSuccess(res, value);
  } catch (err) {
    console.error('Erreur getAdminValueById:', err);
    return sendError(res, 'Erreur lors de la consultation administrative de l\'observation', 500);
  }
}

/**
 * PUT /api/data/admin/values/:id
 */
async function updateValue(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const updated = await dataAdminService.updateValue(id, req.body, req.session.user);
    return sendSuccess(res, updated);
  } catch (err) {
    console.error('Erreur updateValue:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de la modification de l\'observation', status);
  }
}

/**
 * POST /api/data/admin/values/:id/sources
 */
async function addSource(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const {
      source_id,
      source_role,
      documentary_tier,
      citation_reference,
      citation_url,
      methodological_robustness,
      notes
    } = req.body;

    if (!source_id) {
      return sendError(res, 'Le champ source_id est obligatoire');
    }

    const validTiers = ['TIER_1_OFFICIAL', 'TIER_2_STATISTICAL', 'TIER_3_ACADEMIC_PEER', 'TIER_4_REPUTABLE_NGO', 'TIER_5_SECONDARY_PRESS'];
    if (documentary_tier && !validTiers.includes(String(documentary_tier).trim().toUpperCase())) {
      return sendError(res, `Niveau documentaire invalide. Valeurs autorisées: ${validTiers.join(', ')}`);
    }

    const validRobustness = ['high', 'medium', 'conditional', 'contentious'];
    if (methodological_robustness && !validRobustness.includes(String(methodological_robustness).trim().toLowerCase())) {
      return sendError(res, `Robustesse méthodologique invalide. Valeurs autorisées: ${validRobustness.join(', ')}`);
    }

    const result = await dataAdminService.addSource(id, {
      source_id: parseInt(source_id, 10),
      source_role,
      documentary_tier: documentary_tier || null,
      citation_reference: citation_reference ? String(citation_reference).trim() : null,
      citation_url: citation_url ? String(citation_url).trim() : null,
      methodological_robustness: methodological_robustness || null,
      notes
    }, req.session.user);

    return sendSuccess(res, result, null, 201);
  } catch (err) {
    console.error('Erreur addSource:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de l\'ajout de la source', status);
  }
}

/**
 * DELETE /api/data/admin/values/:id/sources/:sourceId
 */
async function removeSource(req, res) {
  try {
    const id = parseId(req.params.id);
    const sourceRecordId = parseId(req.params.sourceId);
    if (!id || !sourceRecordId) return sendError(res, 'Identifiants invalides');

    const result = await dataAdminService.removeSource(id, sourceRecordId, req.session.user);
    return sendSuccess(res, result);
  } catch (err) {
    console.error('Erreur removeSource:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors du retrait de la source', status);
  }
}

/**
 * POST /api/data/admin/values/:id/breakdowns
 */
async function addBreakdown(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const {
      breakdown_item_id,
      value_numeric,
      percentage,
      rank,
      electoral_party_id,
      notes
    } = req.body;

    if (!breakdown_item_id || value_numeric === undefined) {
      return sendError(res, 'Champs breakdown_item_id et value_numeric obligatoires');
    }

    const result = await dataAdminService.addBreakdown(id, {
      breakdown_item_id: parseInt(breakdown_item_id, 10),
      value_numeric: Number(value_numeric),
      percentage: percentage !== undefined ? Number(percentage) : null,
      rank: rank ? parseInt(rank, 10) : null,
      electoral_party_id: electoral_party_id ? parseInt(electoral_party_id, 10) : null,
      notes
    }, req.session.user);

    return sendSuccess(res, result, null, 201);
  } catch (err) {
    console.error('Erreur addBreakdown:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de l\'ajout de la ventilation', status);
  }
}

/**
 * DELETE /api/data/admin/values/:id/breakdowns/:breakdownId
 */
async function removeBreakdown(req, res) {
  try {
    const id = parseId(req.params.id);
    const breakdownId = parseId(req.params.breakdownId);
    if (!id || !breakdownId) return sendError(res, 'Identifiants invalides');

    const result = await dataAdminService.removeBreakdown(id, breakdownId, req.session.user);
    return sendSuccess(res, result);
  } catch (err) {
    console.error('Erreur removeBreakdown:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de la suppression de la ventilation', status);
  }
}

/**
 * POST /api/data/admin/values/:id/submit
 */
async function submitForReview(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const result = await dataAdminService.submitForReview(id, req.session.user);
    return sendSuccess(res, result);
  } catch (err) {
    console.error('Erreur submitForReview:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de la soumission à validation', status);
  }
}

/**
 * POST /api/data/admin/values/:id/validate
 */
async function validateMethodology(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const { validation_notes } = req.body;
    const result = await dataAdminService.validateMethodology(id, validation_notes, req.session.user);
    return sendSuccess(res, result);
  } catch (err) {
    console.error('Erreur validateMethodology:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de la validation méthodologique', status);
  }
}

/**
 * POST /api/data/admin/values/:id/reject
 */
async function rejectValue(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const { rejection_reason } = req.body;
    const result = await dataAdminService.rejectValue(id, rejection_reason, req.session.user);
    return sendSuccess(res, result);
  } catch (err) {
    console.error('Erreur rejectValue:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors du rejet de l\'observation', status);
  }
}

/**
 * POST /api/data/admin/values/:id/audit-decision
 */
async function decideAudit(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const { decision, notes, evidence_url, evidence_reference } = req.body;
    const result = await dataAdminService.decideAudit(
      id,
      { decision, notes, evidence_url, evidence_reference },
      req.session.user
    );
    return sendSuccess(res, result);
  } catch (err) {
    console.error('Erreur decideAudit:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de la décision sur l\'audit', status);
  }
}

/**
 * POST /api/data/admin/values/:id/request-correction
 */
async function requestCorrection(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const { correction_notes } = req.body;
    const result = await dataAdminService.requestCorrection(id, correction_notes, req.session.user);
    return sendSuccess(res, result);
  } catch (err) {
    console.error('Erreur requestCorrection:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de la demande de correction', status);
  }
}

/**
 * POST /api/data/admin/values/:id/publish
 */
async function publishValue(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const { public_reason_summary } = req.body;
    const result = await dataAdminService.publishValue(id, public_reason_summary, req.session.user);
    return sendSuccess(res, result);
  } catch (err) {
    console.error('Erreur publishValue:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de la publication', status);
  }
}

/**
 * POST /api/data/admin/values/:id/revise
 */
async function createRevision(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const { reason } = req.body;
    const revision = await dataAdminService.createRevision(id, reason, req.session.user);
    return sendSuccess(res, revision, null, 201);
  } catch (err) {
    console.error('Erreur createRevision:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de la création de la révision', status);
  }
}

/**
 * POST /api/data/admin/values/:id/revoke
 */
async function revokeValue(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const { reason } = req.body;
    const revoked = await dataAdminService.revokeValue(id, reason, req.session.user);
    return sendSuccess(res, revoked);
  } catch (err) {
    console.error('Erreur revokeValue:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de la révocation', status);
  }
}

/**
 * POST /api/data/admin/values/:id/archive
 */
async function archiveValue(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const archived = await dataAdminService.archiveValue(id, req.session.user);
    return sendSuccess(res, archived);
  } catch (err) {
    console.error('Erreur archiveValue:', err);
    const status = err.status || 500;
    return sendError(res, err.message || 'Erreur lors de l\'archivage', status);
  }
}

/**
 * GET /api/data/admin/stats
 */
async function getStats(req, res) {
  try {
    const stats = await dataAdminService.getStats(req.query);
    return sendSuccess(res, stats);
  } catch (err) {
    console.error('Erreur getStats:', err);
    return sendError(res, 'Erreur lors du calcul des statistiques DATA', 500);
  }
}

/**
 * GET /api/data/admin/audit-log
 */
async function getAuditLog(req, res) {
  try {
    const log = await dataAdminService.getGlobalAuditLog(req.query);
    return sendSuccess(res, log.items, log.pagination);
  } catch (err) {
    console.error('Erreur getAuditLog:', err);
    return sendError(res, 'Erreur lors de la récupération du journal d\'audit', 500);
  }
}

/**
 * GET /api/data/admin/sources-stats
 */
async function getSourcesStats(req, res) {
  try {
    const sources = await dataAdminService.getSourcesWithStats();
    return sendSuccess(res, sources);
  } catch (err) {
    console.error('Erreur getSourcesStats:', err);
    return sendError(res, 'Erreur lors de la récupération des sources documentaires', 500);
  }
}

/**
 * GET /api/data/admin/values/:id/history
 */
async function getValueHistory(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant d\'observation invalide');

    const history = await dataAdminService.getValueHistory(id);
    return sendSuccess(res, history);
  } catch (err) {
    console.error('Erreur getValueHistory:', err);
    return sendError(res, 'Erreur lors de la récupération de l\'historique', 500);
  }
}

/**
 * GET /api/data/admin/referentials/breakdowns
 */
async function getBreakdownReferentials(req, res) {
  try {
    const referentials = await dataAdminService.getBreakdownReferentials();
    return sendSuccess(res, referentials);
  } catch (err) {
    console.error('Erreur getBreakdownReferentials:', err);
    return sendError(res, 'Erreur lors de la récupération des dimensions de ventilation', 500);
  }
}

/**
 * GET /api/data/admin/publications
 */
async function listPublications(req, res) {
  try {
    const { institution_id, category, status, indicator_code, domain, search, page, limit } = req.query;
    const result = await dataPublicationService.listPublications({
      institutionId: institution_id,
      documentCategory: category,
      verificationStatus: status,
      indicatorCode: indicator_code,
      domain,
      search,
      page,
      limit
    });
    return sendSuccess(res, result.publications, result.meta);
  } catch (err) {
    console.error('Erreur listPublications:', err);
    return sendError(res, err.message || 'Erreur lors de la récupération des publications', err.status || 500);
  }
}

/**
 * GET /api/data/admin/publications/stats
 */
async function getPublicationsStats(req, res) {
  try {
    const stats = await dataPublicationService.getPublicationsStats();
    return sendSuccess(res, stats);
  } catch (err) {
    console.error('Erreur getPublicationsStats:', err);
    return sendError(res, 'Erreur lors de la récupération des statistiques du corpus documentaire', 500);
  }
}

/**
 * GET /api/data/admin/publications/uncovered-indicators
 */
async function getUncoveredIndicators(req, res) {
  try {
    const indicators = await dataPublicationService.getUncoveredIndicators();
    return sendSuccess(res, indicators, { total: indicators.length });
  } catch (err) {
    console.error('Erreur getUncoveredIndicators:', err);
    return sendError(res, 'Erreur lors de la récupération des indicateurs sans documentation vérifiée', 500);
  }
}

/**
 * GET /api/data/admin/publications/:id
 */
async function getPublicationById(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant de publication invalide', 400);

    const publication = await dataPublicationService.getPublicationById(id);
    if (!publication) {
      return sendError(res, `Publication #${id} introuvable`, 404);
    }
    return sendSuccess(res, publication);
  } catch (err) {
    console.error('Erreur getPublicationById:', err);
    return sendError(res, 'Erreur lors de la récupération de la publication', 500);
  }
}

/**
 * POST /api/data/admin/publications
 */
async function createPublication(req, res) {
  try {
    const publication = await dataPublicationService.createPublication(req.body);
    return sendSuccess(res, publication, null, 201);
  } catch (err) {
    console.error('Erreur createPublication:', err);
    return sendError(res, err.message || 'Erreur lors de la création de la publication', err.status || 400);
  }
}

/**
 * PUT /api/data/admin/publications/:id
 */
async function updatePublication(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant de publication invalide', 400);

    const updated = await dataPublicationService.updatePublication(id, req.body);
    return sendSuccess(res, updated);
  } catch (err) {
    console.error('Erreur updatePublication:', err);
    return sendError(res, err.message || 'Erreur lors de la mise à jour de la publication', err.status || 400);
  }
}

/**
 * DELETE /api/data/admin/publications/:id
 */
async function deletePublication(req, res) {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 'Identifiant de publication invalide', 400);

    const result = await dataPublicationService.deletePublication(id);
    return sendSuccess(res, result);
  } catch (err) {
    console.error('Erreur deletePublication:', err);
    return sendError(res, err.message || 'Erreur lors de la suppression de la publication', err.status || 400);
  }
}

module.exports = {
  createDraft,
  listAdminValues,
  getAdminValueById,
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
  getAuditLog,
  getSourcesStats,
  listPublications,
  getPublicationsStats,
  getUncoveredIndicators,
  getPublicationById,
  createPublication,
  updatePublication,
  deletePublication
};
