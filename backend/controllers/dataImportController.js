'use strict';

const fs = require('fs');
const path = require('path');
const dataImportService = require('../services/dataImportService');
const pool = require('../config/database');

const IMPORTS_DIR = path.join(__dirname, '../../uploads/imports');
if (!fs.existsSync(IMPORTS_DIR)) {
  fs.mkdirSync(IMPORTS_DIR, { recursive: true });
}

function sendSuccess(res, data, meta = null, status = 200) {
  const payload = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
}

function sendError(res, message, status = 400, details = null) {
  const payload = { success: false, error: message };
  if (details) payload.details = details;
  return res.status(status).json(payload);
}

/**
 * 1. Téléversement de fichier et extraction initiale de l'aperçu
 */
async function uploadAndPreview(req, res) {
  try {
    if (!req.file) {
      return sendError(res, 'Aucun fichier transmis dans la requête');
    }

    const { originalname, mimetype, buffer } = req.file;

    // Validation stricte des extensions autorisées
    const ext = path.extname(originalname).toLowerCase();
    if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
      return sendError(res, 'Extension de fichier non autorisée. Seuls les formats .csv et .xlsx/.xls sont acceptés');
    }

    // 1. Enregistrement initial du lot en base
    const batch = await dataImportService.createBatch({
      fileName: originalname,
      buffer,
      mimeType: mimetype,
      userId: req.session.user.id
    });

    // 2. Sauvegarde temporaire sécurisée du buffer sur disque (droits stricts lecture/écriture sans exécution)
    const storagePath = path.join(IMPORTS_DIR, `batch-${batch.id}${ext}`);
    fs.writeFileSync(storagePath, buffer, { mode: 0o600 });

    // Mettre à jour storage_path dans import_batches
    await pool.query('UPDATE import_batches SET storage_path = $1 WHERE id = $2', [storagePath, batch.id]);

    // 3. Extraction de l'aperçu (premières lignes et en-têtes)
    const preview = dataImportService.parsePreview(buffer);

    return sendSuccess(res, {
      batch: {
        id: batch.id,
        file_name: batch.file_name,
        file_size_bytes: batch.file_size_bytes,
        mime_type: batch.mime_type,
        sha256_checksum: batch.sha256_checksum,
        status: batch.status,
        created_at: batch.created_at
      },
      headers: preview.headers,
      previewRows: preview.previewRows,
      estimatedTotalRows: preview.estimatedTotalRows
    }, null, 201);
  } catch (err) {
    console.error('Erreur uploadAndPreview:', err);
    return sendError(res, err.message || 'Erreur lors du traitement du fichier', err.status || 500);
  }
}

/**
 * 2. Validation du lot avec le mapping et les valeurs par défaut
 */
async function validateMapping(req, res) {
  try {
    const batchId = parseInt(req.params.id, 10);
    if (isNaN(batchId)) return sendError(res, 'ID de lot invalide');

    const { mapping = {}, defaults = {} } = req.body;

    // Récupérer le chemin de stockage
    const batchRes = await pool.query('SELECT storage_path FROM import_batches WHERE id = $1', [batchId]);
    if (batchRes.rows.length === 0) {
      return sendError(res, `Lot #${batchId} introuvable`, 404);
    }

    const storagePath = batchRes.rows[0].storage_path;
    if (!storagePath || !fs.existsSync(storagePath)) {
      return sendError(res, 'Le fichier source du lot est introuvable ou a été purgé', 410);
    }

    const buffer = fs.readFileSync(storagePath);

    const validationResult = await dataImportService.validateAndStageLines(
      batchId,
      buffer,
      { mapping, defaults },
      req.session.user.id
    );

    return sendSuccess(res, validationResult);
  } catch (err) {
    console.error('Erreur validateMapping:', err);
    return sendError(res, err.message || 'Erreur lors de la validation des données', err.status || 500);
  }
}

/**
 * 3. Application du lot : création effective des observations en brouillon
 */
async function applyBatch(req, res) {
  try {
    const batchId = parseInt(req.params.id, 10);
    if (isNaN(batchId)) return sendError(res, 'ID de lot invalide');

    const result = await dataImportService.applyValidatedBatch(batchId, req.session.user);

    return sendSuccess(res, result);
  } catch (err) {
    console.error('Erreur applyBatch:', err);
    return sendError(res, err.message || 'Erreur lors de l\'ingestion des données', err.status || 500);
  }
}

/**
 * 4. Téléchargement du fichier CSV des lignes en erreur
 */
async function downloadRejectedCsv(req, res) {
  try {
    const batchId = parseInt(req.params.id, 10);
    if (isNaN(batchId)) return sendError(res, 'ID de lot invalide');

    const csvContent = await dataImportService.generateRejectedCsv(batchId);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rejets-import-lot-${batchId}.csv"`);
    return res.status(200).send('\uFEFF' + csvContent); // UTF-8 BOM pour compatibilité Excel
  } catch (err) {
    console.error('Erreur downloadRejectedCsv:', err);
    return sendError(res, err.message || 'Erreur lors de la génération du CSV des rejets', err.status || 500);
  }
}

/**
 * 5. Liste paginée des lots d'importation
 */
async function listBatches(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const result = await dataImportService.listBatches({ limit, offset });
    return sendSuccess(res, result.batches, { total: result.total, limit, offset });
  } catch (err) {
    console.error('Erreur listBatches:', err);
    return sendError(res, err.message || 'Erreur lors de la récupération des lots', 500);
  }
}

/**
 * 6. Détail d'un lot et de ses lignes
 */
async function getBatch(req, res) {
  try {
    const batchId = parseInt(req.params.id, 10);
    if (isNaN(batchId)) return sendError(res, 'ID de lot invalide');

    const result = await dataImportService.getBatchById(batchId);
    return sendSuccess(res, result);
  } catch (err) {
    console.error('Erreur getBatch:', err);
    return sendError(res, err.message || 'Erreur lors de la récupération du lot', err.status || 500);
  }
}

module.exports = {
  uploadAndPreview,
  validateMapping,
  applyBatch,
  downloadRejectedCsv,
  listBatches,
  getBatch
};
