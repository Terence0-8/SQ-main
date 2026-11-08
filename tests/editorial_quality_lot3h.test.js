'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');
const pool = require('../backend/config/database');
const editorialQualityService = require('../backend/services/editorialQualityService');

describe('SOLITIQUO — LOT 3H : AUDIT GLOBAL D\'INTELLIGIBILITE, QUALITE EDITORIALE & FIABILITE', () => {

  after(async () => {
    // Teardown
  });

  // -------------------------------------------------------------------------
  // 1. Annuaire public des partis politiques
  // -------------------------------------------------------------------------
  test('1. L\'annuaire public des partis exclut strictement les résidus de test et fiches incomplètes', async () => {
    const res = await request(app)
      .get('/api/parties')
      .expect(200);

    assert.equal(res.body.success, true);
    const parties = res.body.data;
    assert.equal(Array.isArray(parties), true);
    assert.ok(parties.length >= 5, 'Au moins 5 partis publics doivent être retournés');

    // Vérifier l'absence absolue de tout résidu de test
    parties.forEach(p => {
      assert.ok(!p.name.match(/^(Parti )?(Mig[0-9]|Test|Demo|Breakdown|[0-9]{4,})/i), `Nom suspect détecté: ${p.name}`);
      assert.ok(!String(p.acronym).match(/^(P3|PTD|PTEST)$/i), `Acronyme suspect: ${p.acronym}`);
      assert.ok(p.description && p.description.length > 15, `Description manquante ou trop courte pour ${p.name}`);
      assert.notEqual(p.leader_name, 'N/A');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Vérification des partis authentiques et réalité institutionnelle
  // -------------------------------------------------------------------------
  test('2. Les partis officiels (RDPC, MRC, SDF, UNDP, PCRN, UDC) sont fidèles à la réalité institutionnelle', async () => {
    const res = await request(app).get('/api/parties').expect(200);
    const parties = res.body.data;

    const rdpc = parties.find(p => p.acronym === 'RDPC');
    const mrc = parties.find(p => p.acronym === 'MRC');
    const sdf = parties.find(p => p.acronym === 'SDF');
    const undp = parties.find(p => p.acronym === 'UNDP');
    const pcrn = parties.find(p => p.acronym === 'PCRN');

    assert.ok(rdpc, 'RDPC doit exister');
    assert.equal(rdpc.leader_name, 'Paul Biya');
    assert.equal(Number(rdpc.seats_assembly), 152);
    assert.equal(rdpc.type, 'majorite');

    assert.ok(mrc, 'MRC doit exister');
    assert.equal(mrc.leader_name, 'Maurice Kamto');
    assert.equal(Number(mrc.seats_assembly), 0);
    assert.equal(mrc.type, 'opposition');
    assert.ok(mrc.description.includes('2020'), 'Explication du boycott 2020 requise');

    assert.ok(sdf, 'SDF doit exister');
    assert.equal(sdf.leader_name, 'Joshua Osih');
    assert.equal(Number(sdf.seats_assembly), 5);
    assert.equal(sdf.type, 'opposition');

    assert.ok(undp, 'UNDP doit exister');
    assert.equal(undp.leader_name, 'Bello Bouba Maïgari');
    assert.equal(Number(undp.seats_assembly), 7);
    assert.equal(undp.type, 'majorite');

    assert.ok(pcrn, 'PCRN doit exister');
    assert.equal(pcrn.leader_name, 'Cabral Libii');
    assert.equal(Number(pcrn.seats_assembly), 5);
    assert.equal(pcrn.type, 'opposition');
  });

  // -------------------------------------------------------------------------
  // 3. Intelligibilité des indicateurs publics & unités citoyennes
  // -------------------------------------------------------------------------
  test('3. Les indicateurs statistiques publics disposent d\'intitulés explicites et d\'unités citoyennes', async () => {
    const res = await request(app)
      .get('/api/data/indicators?exclude_tests=true')
      .expect(200);

    assert.equal(res.body.success, true);
    const inds = res.body.data;
    assert.ok(inds.length >= 10, 'Au moins 10 indicateurs publics');

    const bannedUnits = ['count', 'units', 'val', 'n/a', ''];
    inds.forEach(ind => {
      assert.ok(!ind.code.match(/^(IND_MIG|IND_TEST|IND_[0-9]{10,}|IND_API|IND_UI|IND_WF|IND_INACT|IND_IMP)/i), `Code test non filtré: ${ind.code}`);
      assert.ok(!ind.name.match(/^(Indicateur Test|Indicateur Mig|Indicateur Inactif)/i), `Nom test non filtré: ${ind.name}`);
      assert.ok(!bannedUnits.includes(String(ind.unit || '').trim().toLowerCase()), `Unité technique interdite: ${ind.unit} sur ${ind.code}`);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Réponses aux 5 questions citoyennes dans les fiches
  // -------------------------------------------------------------------------
  test('4. La fiche détaillée d\'indicateur répond aux 5 repères citoyens', async () => {
    const res = await request(app)
      .get('/api/data/indicators/ECO_PIB_NOM')
      .expect(200);

    assert.equal(res.body.success, true);
    const ind = res.body.data;

    // 1. Que mesure cet indicateur ? (Description)
    assert.ok(ind.description && ind.description.length > 20, 'Description détaillée requise');

    // 2. Que signifie le chiffre affiché ? (Unité & Nom)
    assert.equal(ind.unit, 'Milliards FCFA');
    assert.ok(ind.name.includes('Produit Intérieur Brut'));

    // 3. Périodicité
    assert.equal(ind.expected_periodicity, 'ANNUAL');

    // 4. Qui a produit cette information ? (Institution)
    assert.ok(ind.producer_institution.includes('INS'));

    // 5. Quelles sont ses limites ou réserves ? (Limitations)
    assert.ok(ind.methodological_limitations && ind.methodological_limitations.length > 20);

    // Présence de la formule de calcul
    assert.ok(ind.calculation_formula);
  });

  // -------------------------------------------------------------------------
  // 5. Alignement des badges et qualification des natures statistiques
  // -------------------------------------------------------------------------
  test('5. Les observations distinguent rigoureusement les données définitives, projections et estimations', async () => {
    const res = await request(app)
      .get('/api/data/search')
      .expect(200);

    assert.equal(res.body.success, true);
    const results = res.body.data;
    assert.ok(results.length > 0);

    results.forEach(obs => {
      assert.ok(obs.estimation_status_label, 'Label de statut requis');
      if (obs.is_estimation) {
        assert.notEqual(obs.estimation_status_label, 'Donnée définitive', 'Une estimation ne peut pas porter le label Donnée définitive');
      }
      assert.notEqual(obs.unit, 'count');
      assert.notEqual(obs.unit, 'units');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Module de contrôle de qualité éditoriale centralisé
  // -------------------------------------------------------------------------
  test('6. Le service de contrôle de qualité éditoriale génère un audit complet et conforme', async () => {
    const report = await editorialQualityService.generateEditorialQualityReport();

    assert.equal(report.success, true);
    assert.ok(report.quality_score >= 80, `Score insuffisant: ${report.quality_score}`);
    assert.equal(report.status, 'CONFORME_PRODUCTION');
    assert.equal(report.anomalies.length, 0);
    assert.ok(report.conformities.length >= 5);

    assert.ok(report.summary.public_parties_count >= 5);
    assert.ok(report.summary.public_indicators_count >= 10);
    assert.ok(report.summary.published_observations_count > 0);
  });

  // -------------------------------------------------------------------------
  // 7. Sanctuarisation inviolable des observations historiques #260, #261, #262, #323
  // -------------------------------------------------------------------------
  test('7. Les observations historiques #260, #261, #262, #323 restent publiées et actives', async () => {
    const res = await pool.query(
      'SELECT id, indicator_id, editorial_status, is_active FROM data_values WHERE id IN (260, 261, 262, 323) ORDER BY id'
    );

    assert.equal(res.rows.length, 4);
    res.rows.forEach(r => {
      assert.equal(r.editorial_status, 'published');
      assert.equal(r.is_active, true);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Sanctuarisation stricte des 24 observations pilotes (#687 à #710)
  // -------------------------------------------------------------------------
  test('8. Les 24 observations pilotes (#687 à #710) sont draft, is_active=false, audit_decision=pending', async () => {
    const res = await pool.query(
      'SELECT id, editorial_status, is_active, audit_decision FROM data_values WHERE id BETWEEN 687 AND 710 ORDER BY id'
    );

    assert.equal(res.rows.length, 24);
    res.rows.forEach(r => {
      assert.equal(r.editorial_status, 'draft');
      assert.equal(r.is_active, false);
      assert.equal(r.audit_decision, 'pending');
    });
  });

  // -------------------------------------------------------------------------
  // 9. Recherche globale propre sans fuite de codes bruts incompréhensibles
  // -------------------------------------------------------------------------
  test('9. La recherche globale ne retourne aucun code brut incompréhensible ni parti test', async () => {
    const res = await request(app)
      .get('/api/search?q=Cameroun')
      .expect(200);

    assert.equal(res.body.success, true);
    const results = res.body.results || [];

    results.forEach(item => {
      // Aucun code brut cryptique ou résidu de migration dans les titres
      assert.ok(!item.title.match(/^(Parti Mig[0-9]|IND_MIG|IND_[0-9]{10,})/i), `Code brut résiduel trouvé dans titre: ${item.title}`);
      assert.ok(!item.title.includes('undefined'), `Titre corrompu avec undefined: ${item.title}`);
      assert.ok(!item.title.includes('NaN'), `Titre corrompu avec NaN: ${item.title}`);

      // Les résultats statistiques doivent respecter le formatage éditorial citoyen
      if (item.type === 'data_stat') {
        assert.ok(item.title.includes(' — '), `Titre statistique non lisible: ${item.title}`);
        assert.ok(item.unit, `Unité manquante sur résultat stat: ${item.title}`);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 10. Intégrité des exports statistiques avec unités citoyennes
  // -------------------------------------------------------------------------
  test('10. Les exports CSV et JSON intègrent les unités citoyennes et natures statistiques', async () => {
    const csvRes = await request(app)
      .get('/api/data/export/csv?indicator=ECO_PIB_NOM')
      .expect(200);

    assert.ok(csvRes.text.includes('\uFEFF'), 'BOM UTF-8 requis');
    assert.ok(csvRes.text.includes('Produit Intérieur Brut'));
    assert.ok(csvRes.text.includes('Milliards FCFA'));

    const jsonRes = await request(app)
      .get('/api/data/export/json?indicator=ECO_PIB_NOM')
      .expect(200);

    assert.equal(jsonRes.body.success, true);
    assert.equal(jsonRes.body.data[0].unit, 'Milliards FCFA');
    assert.ok(jsonRes.body.data[0].statistical_nature);
  });

});
