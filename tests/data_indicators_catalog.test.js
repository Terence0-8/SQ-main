/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3A : CATALOGUE DES INDICATEURS STATISTIQUES TESTS
 * =============================================================================
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');
const pool = require('../backend/config/database');
const {
  STATISTICAL_DOMAINS,
  OFFICIAL_INSTITUTIONS,
  INDICATORS_CATALOG
} = require('../backend/data/indicatorsCatalog');

describe('SOLITIQUO DATA — LOT 3A CATALOGUE DES INDICATEURS STATISTIQUES SUITE', () => {

  // ===========================================================================
  // 1. STRUCTURE ET COUVERTURE DES 12 DOMAINES STATISTIQUES
  // ===========================================================================
  describe('Couverture des 12 domaines statistiques', () => {
    test('Les 12 domaines statistiques requis sont exactement définis', () => {
      assert.equal(STATISTICAL_DOMAINS.length, 12, '12 domaines statistiques requis');
      const domainCodes = STATISTICAL_DOMAINS.map(d => d.code);
      const expectedCodes = [
        'demographie',
        'economie',
        'emploi',
        'education',
        'sante',
        'agriculture',
        'energie',
        'territoires',
        'elections',
        'securite',
        'environnement',
        'gouvernance'
      ];
      for (const expected of expectedCodes) {
        assert.ok(domainCodes.includes(expected), `Le domaine "${expected}" doit être présent`);
      }
    });

    test('Chacun des 12 domaines contient au moins 3 indicateurs documentés', () => {
      for (const domain of STATISTICAL_DOMAINS) {
        const indicatorsInDomain = INDICATORS_CATALOG.filter(i => i.category === domain.code);
        assert.ok(
          indicatorsInDomain.length >= 3,
          `Le domaine "${domain.label}" (${domain.code}) doit avoir au moins 3 indicateurs (actuel: ${indicatorsInDomain.length})`
        );
      }
    });
  });

  // ===========================================================================
  // 2. NORMALISATION MÉTHODOLOGIQUE DE CHAQUE INDICATEUR
  // ===========================================================================
  describe('Fiche normalisée et intégrité méthodologique', () => {
    const validDataNatures = ['count', 'rate', 'percentage', 'currency', 'ratio', 'score'];
    const validPeriodicities = ['ANNUAL', 'MONTHLY', 'QUARTERLY', 'DECENNIAL', 'IRREGULAR', 'ELECTORAL_CYCLE'];
    const validDefStatuses = ['verified_institutional', 'solitiquo_working', 'method_to_be_specified'];
    const validStatuses = ['proposed', 'validated', 'active'];

    test('Tous les codes indicateurs sont uniques, stables et au format conventionnel', () => {
      const codes = new Set();
      for (const ind of INDICATORS_CATALOG) {
        assert.ok(ind.code, 'Le code indicateur est obligatoire');
        assert.match(ind.code, /^[A-Z0-9_]{3,30}$/, `Code indicateur invalide : ${ind.code}`);
        assert.ok(!codes.has(ind.code), `Code indicateur dupliqué : ${ind.code}`);
        codes.add(ind.code);
      }
    });

    test('Chaque indicateur dispose de l\'intégralité des champs de sa fiche normalisée', () => {
      for (const ind of INDICATORS_CATALOG) {
        assert.ok(ind.name && ind.name.length >= 5, `Nom officiel manquant ou trop court : ${ind.code}`);
        assert.ok(ind.short_name && ind.short_name.length <= 50, `Nom court invalide : ${ind.code}`);
        assert.ok(ind.description && ind.description.length >= 20, `Définition précise requise : ${ind.code}`);
        assert.ok(ind.unit, `Unité de mesure requise : ${ind.code}`);
        assert.ok(ind.subdomain, `Sous-domaine requis : ${ind.code}`);
        assert.ok(validDataNatures.includes(ind.data_nature), `data_nature invalide (${ind.data_nature}) pour ${ind.code}`);
        assert.ok(validPeriodicities.includes(ind.expected_periodicity), `Périodicité invalide (${ind.expected_periodicity}) pour ${ind.code}`);
        assert.ok(Array.isArray(ind.geographical_levels) && ind.geographical_levels.length > 0, `Niveaux géo requis pour ${ind.code}`);
        assert.ok(ind.producer_institution, `Institution productrice requise pour ${ind.code}`);
        assert.ok(ind.methodological_limitations, `Limites méthodologiques requises pour ${ind.code}`);
        assert.ok(validDefStatuses.includes(ind.definition_status), `definition_status invalide (${ind.definition_status}) pour ${ind.code}`);
        assert.ok(validStatuses.includes(ind.status), `status invalide (${ind.status}) pour ${ind.code}`);
      }
    });

    test('Distinction rigoureuse : aucune confusion entre taux, pourcentages et effectifs bruts', () => {
      for (const ind of INDICATORS_CATALOG) {
        if (ind.data_nature === 'count') {
          assert.notEqual(ind.unit, 'pourcentage', `${ind.code} (count) ne peut pas avoir pour unité "pourcentage"`);
        }
        if (ind.data_nature === 'percentage' || ind.data_nature === 'rate') {
          assert.notEqual(ind.unit, 'personnes', `${ind.code} (taux/pourcentage) ne peut pas avoir pour unité "personnes"`);
          assert.notEqual(ind.unit, 'tonnes', `${ind.code} (taux/pourcentage) ne peut pas avoir pour unité "tonnes"`);
        }
        if (ind.data_nature === 'currency') {
          assert.match(ind.unit, /fcfa/i, `${ind.code} monétaire doit être libellé en FCFA`);
        }
      }
    });

    test('Distinction entre définitions institutionnelles, travail Solitiquo et méthodes à préciser', () => {
      const institutional = INDICATORS_CATALOG.filter(i => i.definition_status === 'verified_institutional');
      const solitiquo = INDICATORS_CATALOG.filter(i => i.definition_status === 'solitiquo_working');
      const toSpecify = INDICATORS_CATALOG.filter(i => i.definition_status === 'method_to_be_specified');

      assert.ok(institutional.length >= 35, 'La majorité des indicateurs doit être institutionnellement vérifiée');
      assert.ok(solitiquo.length >= 1, 'Au moins un indicateur de travail Solitiquo cadré');
      assert.ok(toSpecify.length >= 1, 'Au moins un indicateur transparentement signalé comme méthode à préciser');

      // Vérifier que les indicateurs "method_to_be_specified" sont bien au statut 'proposed' et non 'active'
      for (const item of toSpecify) {
        assert.equal(item.status, 'proposed', `L'indicateur ${item.code} avec méthode à préciser doit rester "proposed"`);
      }
    });
  });

  // ===========================================================================
  // 3. PERSISTANCE EN BASE DE DONNÉES ET RÉFÉRENTIELS D'INSTITUTIONS
  // ===========================================================================
  describe('Intégration en base de données', () => {
    test('Les institutions camerounaises majeures sont présentes dans data_sources', async () => {
      const acronymsToCheck = ['INS', 'BUCREP', 'MINFI', 'BEAC', 'MINEPAT', 'MINSANTE', 'MINEDUB', 'MINESEC', 'ELECAM'];
      const res = await pool.query(
        'SELECT acronym, name, institution_type FROM data_sources WHERE acronym = ANY($1)',
        [acronymsToCheck]
      );
      const foundAcronyms = res.rows.map(r => r.acronym);
      for (const acr of acronymsToCheck) {
        assert.ok(foundAcronyms.includes(acr), `L'institution "${acr}" doit être présente dans data_sources`);
      }
    });

    test('Tous les indicateurs du catalogue sont insérés dans data_indicators avec leurs métadonnées', async () => {
      const res = await pool.query(`
        SELECT code, name, short_name, category, subdomain, data_nature, definition_status, status
        FROM data_indicators
        WHERE code = ANY($1)
      `, [INDICATORS_CATALOG.map(i => i.code)]);

      assert.equal(res.rows.length, INDICATORS_CATALOG.length, 'Tous les indicateurs du catalogue doivent être en base');

      const popTot = res.rows.find(r => r.code === 'POP_TOT_COUNT');
      assert.ok(popTot);
      assert.equal(popTot.category, 'demographie');
      assert.equal(popTot.subdomain, 'dynamique_demographique');
      assert.equal(popTot.data_nature, 'count');
      assert.equal(popTot.definition_status, 'verified_institutional');
    });

    test('Aucune valeur statistique fictive ou publiée n\'a été créée pour remplir ces indicateurs', async () => {
      const newlyCatalogedCodes = INDICATORS_CATALOG.map(i => i.code).filter(c => c !== 'ECO_PIB_NOM');
      const res = await pool.query(`
        SELECT COUNT(*) AS total
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE di.code = ANY($1) AND dv.editorial_status = 'published'
      `, [newlyCatalogedCodes]);

      assert.equal(parseInt(res.rows[0].total, 10), 0, 'Le catalogue d\'indicateurs ne doit comporter aucune valeur statistique publiée');
    });
  });

  // ===========================================================================
  // 4. API PUBLIQUE : CONSULTATION DU CATALOGUE ET DES FICHES
  // ===========================================================================
  describe('Endpoints API de consultation du catalogue', () => {
    test('GET /api/data/indicators — retourne les indicateurs avec métadonnées enrichies', async () => {
      const res = await request(app)
        .get('/api/data/indicators')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= INDICATORS_CATALOG.length);

      const sample = res.body.data.find(i => i.code === 'ECO_PIB_NOM');
      assert.ok(sample, 'Indicateur ECO_PIB_NOM doit être retourné');
      assert.equal(sample.short_name, 'PIB nominal');
      assert.equal(sample.category, 'economie');
      assert.equal(sample.subdomain, 'comptes_nationaux');
      assert.equal(sample.data_nature, 'currency');
      assert.equal(sample.expected_periodicity, 'ANNUAL');
      assert.equal(sample.definition_status, 'verified_institutional');
    });

    test('GET /api/data/indicators?category=demographie — filtre par domaine', async () => {
      const res = await request(app)
        .get('/api/data/indicators?category=demographie')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.ok(res.body.data.length >= 5);
      for (const item of res.body.data) {
        assert.equal(item.category, 'demographie');
      }
    });

    test('GET /api/data/indicators?domain=sante — alias domain fonctionne comme category', async () => {
      const res = await request(app)
        .get('/api/data/indicators?domain=sante')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.ok(res.body.data.length >= 4);
      for (const item of res.body.data) {
        assert.equal(item.category, 'sante');
      }
    });

    test('GET /api/data/indicators?status=proposed — permet de consulter les indicateurs proposés', async () => {
      const res = await request(app)
        .get('/api/data/indicators?status=proposed')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.ok(res.body.data.length >= 2);
      for (const item of res.body.data) {
        assert.equal(item.status, 'proposed');
      }
    });

    test('GET /api/data/indicators/:code — retourne la fiche normalisée complète d\'un indicateur', async () => {
      const res = await request(app)
        .get('/api/data/indicators/POP_TOT_COUNT')
        .expect(200);

      assert.equal(res.body.success, true);
      const data = res.body.data;
      assert.equal(data.code, 'POP_TOT_COUNT');
      assert.equal(data.short_name, 'Population totale');
      assert.equal(data.unit, 'personnes');
      assert.equal(data.data_nature, 'count');
      assert.equal(data.expected_periodicity, 'ANNUAL');
      assert.ok(Array.isArray(data.geographical_levels));
      assert.ok(data.geographical_levels.includes('country'));
      assert.match(data.calculation_formula, /P\(t\)/);
      assert.match(data.methodological_limitations, /RGPH-3/i);
      assert.equal(data.availability_start_year, 1976);
      assert.equal(data.definition_status, 'verified_institutional');
    });

    test('GET /api/data/indicators/UNKNOWN_CODE — retourne 404 pour un indicateur inexistant', async () => {
      const res = await request(app)
        .get('/api/data/indicators/UNKNOWN_NON_EXISTENT_IND')
        .expect(404);

      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Indicateur introuvable/i);
    });
  });
});
