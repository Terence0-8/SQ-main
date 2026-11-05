'use strict';

const dataService = require('../services/dataService');
const dataPublicationService = require('../services/dataPublicationService');

/**
 * Contrôleur pour l'API publique Solitiquo DATA
 * Validation des entrées, protection contre les injections et formatage des réponses standardisées.
 */

// Formatage de réponse standardisé
const sendSuccess = (res, data, meta = null, status = 200) => {
  const payload = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
};

const sendError = (res, message, status = 400) => {
  return res.status(status).json({ success: false, error: message });
};

/**
 * GET /api/data/territories
 */
async function getTerritories(req, res) {
  try {
    const { type, parent_code } = req.query;

    if (type && typeof type !== 'string') {
      return sendError(res, 'Paramètre "type" invalide');
    }

    if (parent_code && typeof parent_code !== 'string') {
      return sendError(res, 'Paramètre "parent_code" invalide');
    }

    const territories = await dataService.getTerritories({
      type: type?.trim(),
      parentCode: parent_code?.trim()
    });

    return sendSuccess(res, territories, { total: territories.length });
  } catch (err) {
    console.error('Erreur getTerritories:', err);
    return sendError(res, 'Erreur lors de la récupération des territoires', 500);
  }
}

/**
 * GET /api/data/indicators
 */
async function getIndicators(req, res) {
  try {
    const { category, domain, subdomain, status, definition_status } = req.query;

    const indicators = await dataService.getIndicators({
      category: (category || domain)?.trim(),
      subdomain: subdomain?.trim(),
      status: status?.trim(),
      definition_status: definition_status?.trim()
    });

    return sendSuccess(res, indicators, { total: indicators.length });
  } catch (err) {
    console.error('Erreur getIndicators:', err);
    return sendError(res, 'Erreur lors de la récupération des indicateurs', 500);
  }
}

/**
 * GET /api/data/indicators/:code
 * Fiche détaillée normalisée d'un indicateur
 */
async function getIndicatorDetails(req, res) {
  try {
    const indicatorCode = req.params.code?.trim();

    if (!indicatorCode || !/^[A-Za-z0-9_-]{2,100}$/.test(indicatorCode)) {
      return sendError(res, 'Format de code indicateur invalide');
    }

    const indicator = await dataService.getIndicatorByCode(indicatorCode);
    if (!indicator) {
      return sendError(res, `Indicateur introuvable : ${indicatorCode}`, 404);
    }

    return sendSuccess(res, indicator);
  } catch (err) {
    console.error('Erreur getIndicatorDetails:', err);
    return sendError(res, 'Erreur lors de la récupération de la fiche indicateur', 500);
  }
}

/**
 * GET /api/data/sources
 */
async function getSources(req, res) {
  try {
    const { institution_type } = req.query;

    if (institution_type && typeof institution_type !== 'string') {
      return sendError(res, 'Paramètre "institution_type" invalide');
    }

    const sources = await dataService.getSources({
      institutionType: institution_type?.trim()
    });

    return sendSuccess(res, sources, { total: sources.length });
  } catch (err) {
    console.error('Erreur getSources:', err);
    return sendError(res, 'Erreur lors de la récupération des sources documentaires', 500);
  }
}

/**
 * GET /api/data/indicators/:code/values
 */
async function getIndicatorValues(req, res) {
  try {
    const indicatorCode = req.params.code?.trim();

    if (!indicatorCode || !/^[A-Za-z0-9_-]{2,100}$/.test(indicatorCode)) {
      return sendError(res, 'Format de code indicateur invalide');
    }

    // Vérifier l'existence et l'activité de l'indicateur
    const indicator = await dataService.getIndicatorByCode(indicatorCode, { onlyActive: true });
    if (!indicator) {
      return sendError(res, `Indicateur introuvable ou inactif : ${indicatorCode}`, 404);
    }

    const {
      territory,
      territory_code,
      period_type,
      year,
      period_start,
      period_end,
      methodology_nature,
      page,
      limit
    } = req.query;

    let parsedYear = null;
    if (year) {
      parsedYear = parseInt(year, 10);
      if (isNaN(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
        return sendError(res, 'Paramètre "year" invalide (1900-2100)');
      }
    }

    const filters = {
      territoryCode: (territory || territory_code)?.trim(),
      periodType: period_type?.trim(),
      year: parsedYear,
      periodStart: period_start?.trim(),
      periodEnd: period_end?.trim(),
      methodologyNature: methodology_nature?.trim(),
      page,
      limit
    };

    const result = await dataService.getIndicatorValues(indicatorCode, filters);
    return sendSuccess(res, result.data, {
      indicator: {
        code: indicator.code,
        name: indicator.name,
        category: indicator.category,
        unit: indicator.unit
      },
      ...result.meta
    });
  } catch (err) {
    console.error('Erreur getIndicatorValues:', err);
    return sendError(res, 'Erreur lors de la récupération des valeurs de l\'indicateur', 500);
  }
}

/**
 * GET /api/data/territories/:code/values
 */
async function getTerritoryValues(req, res) {
  try {
    const territoryCode = req.params.code?.trim();

    if (!territoryCode || !/^[A-Za-z0-9_-]{2,50}$/.test(territoryCode)) {
      return sendError(res, 'Format de code territoire invalide');
    }

    // Vérifier l'existence du territoire
    const territory = await dataService.getTerritoryByCode(territoryCode);
    if (!territory) {
      return sendError(res, `Territoire introuvable : ${territoryCode}`, 404);
    }

    const {
      indicator,
      indicator_code,
      category,
      period_type,
      year,
      period_start,
      period_end,
      methodology_nature,
      page,
      limit
    } = req.query;

    let parsedYear = null;
    if (year) {
      parsedYear = parseInt(year, 10);
      if (isNaN(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
        return sendError(res, 'Paramètre "year" invalide (1900-2100)');
      }
    }

    const filters = {
      indicatorCode: (indicator || indicator_code)?.trim(),
      category: category?.trim(),
      periodType: period_type?.trim(),
      year: parsedYear,
      periodStart: period_start?.trim(),
      periodEnd: period_end?.trim(),
      methodologyNature: methodology_nature?.trim(),
      page,
      limit
    };

    const result = await dataService.getTerritoryValues(territoryCode, filters);
    return sendSuccess(res, result.data, {
      territory: {
        code: territory.code,
        name: territory.name,
        type: territory.type
      },
      ...result.meta
    });
  } catch (err) {
    console.error('Erreur getTerritoryValues:', err);
    return sendError(res, 'Erreur lors de la récupération des valeurs du territoire', 500);
  }
}

/**
 * GET /api/data/values/:id
 */
async function getValueById(req, res) {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id) || id <= 0) {
      return sendError(res, 'Identifiant d\'observation invalide (nombre entier positif attendu)', 400);
    }

    const value = await dataService.getValueById(id);
    if (!value) {
      return sendError(res, `Observation statistique introuvable ou non publiée (ID: ${id})`, 404);
    }

    return sendSuccess(res, value);
  } catch (err) {
    console.error('Erreur getValueById:', err);
    return sendError(res, 'Erreur lors de la récupération du détail de l\'observation', 500);
  }
}

/**
 * GET /api/data/publications
 */
async function getPublications(req, res) {
  try {
    const { category, domain, indicator_code, search, page, limit } = req.query;
    const result = await dataPublicationService.listPublications({
      documentCategory: category,
      verificationStatus: 'verified_consulted',
      domain,
      indicatorCode: indicator_code,
      search,
      page,
      limit
    });
    return sendSuccess(res, result.publications, result.meta);
  } catch (err) {
    console.error('Erreur getPublications:', err);
    return sendError(res, 'Erreur lors de la récupération des publications documentaires', 500);
  }
}

/**
 * GET /api/data/publications/:id
 */
async function getPublicationById(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) return sendError(res, 'Identifiant de publication invalide', 400);

    const pub = await dataPublicationService.getPublicationById(id);
    if (!pub || pub.verification_status !== 'verified_consulted') {
      return sendError(res, 'Publication introuvable ou non vérifiée', 404);
    }
    return sendSuccess(res, pub);
  } catch (err) {
    console.error('Erreur getPublicationById:', err);
    return sendError(res, 'Erreur lors de la récupération de la publication', 500);
  }
}

/**
 * GET /api/data/search (et /api/search/statistics) (Lot 3D)
 * Recherche multi-critères dans les observations statistiques publiées et actives
 */
async function searchStatistics(req, res) {
  try {
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
      page,
      limit,
      sort
    } = req.query;

    const result = await dataService.searchPublishedStatistics({
      q: typeof q === 'string' ? q.trim() : null,
      indicator: (indicator || indicator_code)?.trim(),
      territory: (territory || territory_code)?.trim(),
      category: (category || domain)?.trim(),
      period_type: period_type?.trim(),
      year: year ? parseInt(year, 10) : null,
      period_start: period_start?.trim(),
      period_end: period_end?.trim(),
      page,
      limit,
      sort
    });

    return sendSuccess(res, result.data, result.meta);
  } catch (err) {
    console.error('Erreur searchStatistics:', err);
    return sendError(res, 'Erreur lors de la recherche statistique', 500);
  }
}

/**
 * GET /api/data/export/csv (Lot 3D)
 * Exportation des observations publiées au format CSV (séparateur point-virgule, UTF-8 avec BOM, anti-injection)
 */
async function exportCsv(req, res) {
  try {
    const records = await dataService.exportPublishedObservations(req.query);
    const csvContent = dataService.generateCsv(records);

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="solitiquo-data-export-${today}.csv"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('Erreur exportCsv:', err);
    return sendError(res, 'Erreur lors de la génération de l\'export CSV', 500);
  }
}

/**
 * GET /api/data/export/json (Lot 3D)
 * Exportation classique structurée des observations publiées
 */
async function exportJson(req, res) {
  try {
    const records = await dataService.exportPublishedObservations(req.query);
    const payload = dataService.generateJson(records, req.query);

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="solitiquo-data-export-${today}.json"`);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('Erreur exportJson:', err);
    return sendError(res, 'Erreur lors de la génération de l\'export JSON', 500);
  }
}

/**
 * GET /api/data/export/json-ld (Lot 3D)
 * Exportation sémantique Schema.org (DataFeed / Observation) des observations publiées
 */
async function exportJsonLd(req, res) {
  try {
    const records = await dataService.exportPublishedObservations(req.query);
    const payload = dataService.generateJsonLd(records, req.query);

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="solitiquo-data-export-${today}.jsonld"`);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('Erreur exportJsonLd:', err);
    return sendError(res, 'Erreur lors de la génération de l\'export JSON-LD', 500);
  }
}

module.exports = {
  getTerritories,
  getIndicators,
  getIndicatorDetails,
  getSources,
  getPublications,
  getPublicationById,
  getIndicatorValues,
  getTerritoryValues,
  getValueById,
  searchStatistics,
  exportCsv,
  exportJson,
  exportJsonLd
};
