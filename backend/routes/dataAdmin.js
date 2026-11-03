'use strict';

const express = require('express');
const router = express.Router();
const dataAdminController = require('../controllers/dataAdminController');
const { isWriter, isAdmin } = require('../middleware/auth');

/**
 * Routes d'administration et de gestion du cycle de vie Solitiquo DATA (Lot 2B)
 * Protégées par authentification (session active) et rôles stricts (writer / admin).
 * Les méthodes mutantes (POST, PUT, DELETE) sont soumises à la vérification CSRF globale.
 */

// Consultation administrative (Writers & Admins)
router.get('/stats', isWriter, dataAdminController.getStats);
router.get('/audit-log', isWriter, dataAdminController.getAuditLog);
router.get('/sources-stats', isWriter, dataAdminController.getSourcesStats);
router.get('/referentials/breakdowns', isWriter, dataAdminController.getBreakdownReferentials);
router.get('/values', isWriter, dataAdminController.listAdminValues);
router.get('/values/:id', isWriter, dataAdminController.getAdminValueById);
router.get('/values/:id/history', isWriter, dataAdminController.getValueHistory);

// Corpus documentaire & Publications statistiques (Lot 3B)
router.get('/publications/stats', isWriter, dataAdminController.getPublicationsStats);
router.get('/publications/uncovered-indicators', isWriter, dataAdminController.getUncoveredIndicators);
router.get('/publications', isWriter, dataAdminController.listPublications);
router.get('/publications/:id', isWriter, dataAdminController.getPublicationById);
router.post('/publications', isWriter, dataAdminController.createPublication);
router.put('/publications/:id', isWriter, dataAdminController.updatePublication);
router.delete('/publications/:id', isWriter, dataAdminController.deletePublication);

// Création et édition de brouillons (Writers & Admins)
router.post('/values', isWriter, dataAdminController.createDraft);
router.put('/values/:id', isWriter, dataAdminController.updateValue);

// Gestion des sources documentaires (Writers & Admins)
router.post('/values/:id/sources', isWriter, dataAdminController.addSource);
router.delete('/values/:id/sources/:sourceId', isWriter, dataAdminController.removeSource);

// Gestion des ventilations statistiques (Writers & Admins)
router.post('/values/:id/breakdowns', isWriter, dataAdminController.addBreakdown);
router.delete('/values/:id/breakdowns/:breakdownId', isWriter, dataAdminController.removeBreakdown);

// Soumission à validation & révision (Writers & Admins)
router.post('/values/:id/submit', isWriter, dataAdminController.submitForReview);
router.post('/values/:id/revise', isWriter, dataAdminController.createRevision);

// Opérations de gouvernance réservées aux Administrateurs (Validation, Rejet, Publication, Révocation, Archivage, Décision d'audit)
router.post('/values/:id/audit-decision', isAdmin, dataAdminController.decideAudit);
router.post('/values/:id/request-correction', isAdmin, dataAdminController.requestCorrection);
router.post('/values/:id/validate', isAdmin, dataAdminController.validateMethodology);
router.post('/values/:id/reject', isAdmin, dataAdminController.rejectValue);
router.post('/values/:id/publish', isAdmin, dataAdminController.publishValue);
router.post('/values/:id/revoke', isAdmin, dataAdminController.revokeValue);
router.post('/values/:id/archive', isAdmin, dataAdminController.archiveValue);

// ============================================================
// Module d'Importation et d'Ingestion des Données (Lot 2D)
// ============================================================
const multer = require('multer');
const dataImportController = require('../controllers/dataImportController');

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    if (ext.endsWith('.csv') || ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

router.get('/imports', isWriter, dataImportController.listBatches);
router.get('/imports/:id', isWriter, dataImportController.getBatch);
router.get('/imports/:id/rejected.csv', isWriter, dataImportController.downloadRejectedCsv);
router.post('/imports/upload', isWriter, importUpload.single('file'), dataImportController.uploadAndPreview);
router.post('/imports/:id/validate', isWriter, dataImportController.validateMapping);
router.post('/imports/:id/apply', isWriter, dataImportController.applyBatch);

module.exports = router;
