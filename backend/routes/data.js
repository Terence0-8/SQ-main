'use strict';

const express = require('express');
const router = express.Router();
const dataController = require('../controllers/dataController');

/**
 * Routes publiques de consultation Solitiquo DATA (Lot 2A)
 * Aucune authentification requise pour la consultation des données publiques actives.
 * Seules les observations publiées et actives (editorial_status = 'published' AND is_active = TRUE) sont exposées.
 * Aucune exposition de données internes, de brouillons ou de notes d'administration.
 */

// Référentiels & Corpus documentaire
router.get('/territories', dataController.getTerritories);
router.get('/indicators', dataController.getIndicators);
router.get('/indicators/:code', dataController.getIndicatorDetails);
router.get('/sources', dataController.getSources);
router.get('/publications', dataController.getPublications);
router.get('/publications/:id', dataController.getPublicationById);

// Observations publiées
router.get('/indicators/:code/values', dataController.getIndicatorValues);
router.get('/territories/:code/values', dataController.getTerritoryValues);
router.get('/values/:id', dataController.getValueById);

// Routes d'administration et workflow éditorial (Lot 2B)
router.use('/admin', require('./dataAdmin'));

module.exports = router;
