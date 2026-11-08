/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3E.3.3 : RÉCONCILIATION FINALE DU PIB 2022,
 * QUALIFICATION DES PREUVES ET CLARIFICATION DES STATUTS D'AUDIT
 * =============================================================================
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../backend/config/database');
const dataAdminService = require('../backend/services/dataAdminService');

describe('SOLITIQUO DATA — LOT 3E.3.3 : RÉCONCILIATION PIB 2022 ET PREUVES STATISTIQUES', () => {
  const wave1Ids = [693, 694, 695, 696, 698, 699, 700, 701, 706, 707, 708, 709, 710];
  const allPilotIds = Array.from({ length: 24 }, (_, i) => 687 + i);

  describe('1. Réconciliation complète de l\'observation #697 (PIB nominal 2022)', () => {
    test('1.1 Valeur réelle, unité, période et statut des comptes en base', async () => {
      const detail = await dataAdminService.getAdminValueById(697);

      assert.equal(Number(detail.id), 697);
      assert.equal(detail.indicator_code, 'ECO_PIB_NOM');
      assert.equal(parseFloat(detail.value_numeric), 27671.2, 'La valeur en base doit être 27 671,2 Mrds FCFA');
      assert.equal(detail.indicator_unit, 'milliards_fcfa');
      assert.equal(detail.period_type, 'ANNUAL');
      assert.equal(detail.methodology_nature, 'administrative_record');
      assert.ok(detail.survey_or_account_status.includes('semi-définitifs'));

      // Statut éditorial et décision humaine
      assert.equal(detail.editorial_status, 'draft');
      assert.equal(detail.is_active, false);
      assert.equal(detail.audit_decision, 'pending');

      // Contrôle technique
      assert.equal(detail.audit_status, 'confirmed_with_caveat');
      assert.ok(detail.audit_caveat.includes('semi-définitif'));
    });

    test('1.2 Source primaire et publication rattachée de #697', async () => {
      const detail = await dataAdminService.getAdminValueById(697);

      assert.ok(detail.sources && detail.sources.length > 0);
      const primSource = detail.sources[0];
      assert.equal(primSource.source_id, 324);
      assert.equal(primSource.source_acronym, 'INS');
      assert.equal(primSource.source_role, 'primary');
      assert.equal(primSource.methodological_robustness, 'medium');
      assert.ok(primSource.citation_reference.includes('Comptes Nationaux du Cameroun'));
      assert.ok(primSource.citation_reference.includes('Tableau 1, p. 12'));

      // Publication rattachée au niveau indicateur : Pub #2
      assert.ok(detail.indicator_publications && detail.indicator_publications.length > 0);
      const pub2 = detail.indicator_publications.find(p => p.id === 2);
      assert.ok(pub2, 'La publication #2 (Comptes Nationaux) doit être rattachée');
      assert.equal(pub2.verification_status, 'institutional_reference_only');
    });

    test('1.3 Les valeurs concurrentes (27 495 et 29 804.8) n\'existent pas dans PostgreSQL pour #697', async () => {
      const res = await pool.query(`
        SELECT id, value_numeric FROM data_values
        WHERE value_numeric IN (27495.0, 27495, 29804.8) AND id = 697
      `);
      assert.equal(res.rows.length, 0, 'Les valeurs textuelles 27 495 et 29 804.8 ne sont pas dans la base');
    });
  });

  describe('2. Qualification des 3 niveaux de preuve et clarification des statuts', () => {
    test('2.1 Distinction nette des 4 notions de gouvernance sur chaque dossier', async () => {
      const detail = await dataAdminService.getAdminValueById(693);
      const ev = detail.evidence_evaluation;

      assert.ok(ev);
      assert.ok(ev.distinct_statuses);

      // 1. Contrôle technique
      assert.equal(detail.audit_status, 'confirmed');

      // 2. Décision humaine
      assert.equal(ev.distinct_statuses.audit_decision, 'pending');

      // 3. Statut éditorial
      assert.equal(ev.distinct_statuses.editorial_status, 'draft');

      // 4. Preuve documentaire
      assert.equal(ev.distinct_statuses.document_status, 'institutional_reference_only');
    });

    test('2.2 Une preuve non archivée localement bloque l\'orientation vers une acceptation', async () => {
      const detail = await dataAdminService.getAdminValueById(693);
      const ev = detail.evidence_evaluation;

      assert.equal(ev.is_pdf_archived, false);
      assert.equal(ev.proposed_decision, 'pending_evidence');
      assert.ok(ev.guidance_message.includes('pending_evidence'));
    });
  });

  describe('3. Contrôle de cohérence des 13 observations de la Vague 1', () => {
    test('3.1 Toutes les 13 observations disposent d\'une référence précise et sont orientées vers pending_evidence', async () => {
      for (const id of wave1Ids) {
        const detail = await dataAdminService.getAdminValueById(id);
        const ev = detail.evidence_evaluation;

        assert.ok(detail.sources && detail.sources.length > 0, `Obs #${id} doit avoir une source`);
        assert.ok(detail.sources[0].citation_reference, `Obs #${id} doit avoir une citation`);
        assert.ok(detail.indicator_publications && detail.indicator_publications.length > 0, `Obs #${id} doit avoir une publication`);

        // Aucune n'a de PDF archivé localement avec SHA-256 certifié
        assert.equal(ev.is_pdf_archived, false, `Obs #${id} ne doit pas avoir de faux PDF archivé`);
        assert.equal(ev.proposed_decision, 'pending_evidence', `Obs #${id} doit recommander pending_evidence`);
      }
    });

    test('3.2 Vérification spécifique des 5 observations TBS primaire (#706–#710)', async () => {
      for (let id = 706; id <= 709; id++) {
        const detail = await dataAdminService.getAdminValueById(id);
        assert.equal(detail.sources[0].source_id, 324);
        assert.equal(detail.sources[0].source_acronym, 'INS');
        assert.ok(detail.sources[0].citation_reference.includes('Annuaire Statistique du Cameroun — Édition 2023'));
        assert.ok(detail.sources[0].citation_reference.includes('Tableau 4.3, p. 76'));
      }

      const detail710 = await dataAdminService.getAdminValueById(710);
      assert.equal(detail710.sources[0].source_id, 330);
      assert.equal(detail710.sources[0].source_acronym, 'MINEDUB');
      assert.ok(detail710.sources[0].citation_reference.includes('Annuaire Statistique de l\'Éducation de Base — Année scolaire 2022/2023'));
      assert.ok(detail710.sources[0].citation_reference.includes('Tableau 3.4, p. 45'));
    });
  });

  describe('4. Sanctuarisation absolue et non-altération du corpus', () => {
    test('4.1 Les 24 observations pilotes (#687 à #710) demeurent strictement draft, is_active=FALSE, audit_decision=pending', async () => {
      const res = await pool.query(`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE editorial_status = 'draft' AND is_active = FALSE AND audit_decision = 'pending') AS valid_count
        FROM data_values
        WHERE id = ANY($1)
      `, [allPilotIds]);

      assert.equal(parseInt(res.rows[0].total, 10), 24);
      assert.equal(parseInt(res.rows[0].valid_count, 10), 24);
    });

    test('4.2 L\'observation historique #261 est rigoureusement intacte', async () => {
      const res = await pool.query(
        'SELECT id, indicator_id, value_numeric, period_start, editorial_status, is_active FROM data_values WHERE id = 261'
      );
      assert.equal(res.rows.length, 1);
      const row = res.rows[0];
      assert.equal(Number(row.id), 261);
      assert.equal(Number(row.indicator_id), 137);
      assert.equal(parseFloat(row.value_numeric), 29850.0);
      assert.equal(row.editorial_status, 'published');
      assert.equal(row.is_active, true);
    });
  });
});
