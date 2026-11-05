const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const pool = require('../backend/config/database');
const documentArchiveService = require('../backend/services/documentArchiveService');

describe('Solitiquo DATA — Lot 3E.2.1 : Correction des incohérences documentaires et sécurisation', () => {

  // =========================================================================
  // 1. AUDIT DES STATUTS DOCUMENTAIRES DES 7 PUBLICATIONS PILOTES
  // =========================================================================
  describe('1. Audit et cohérence stricte des statuts documentaires', () => {
    it('ne doit conserver AUCUNE des 7 publications en verified_consulted sans preuve matérielle', async () => {
      const res = await pool.query(`
        SELECT id, title, verification_status, consultation_date
        FROM data_publications
        WHERE id IN (1, 2, 4, 6, 8, 12, 72)
      `);

      assert.strictEqual(res.rows.length, 7, 'Les 7 publications du pilote sont présentes');
      for (const row of res.rows) {
        assert.notStrictEqual(
          row.verification_status,
          'verified_consulted',
          `Publication #${row.id} ne peut pas être 'verified_consulted' sans consultation réelle démontrée`
        );
        assert.strictEqual(
          row.consultation_date,
          null,
          `Publication #${row.id} ne doit avoir AUCUNE date de consultation fictive`
        );
      }
    });

    it('doit classer exactement les 7 publications selon la réalité de leur preuve', async () => {
      const res = await pool.query(`
        SELECT dp.id, dp.verification_status as pub_status, dde.document_status as ev_status
        FROM data_publications dp
        JOIN data_document_evidence dde ON dde.publication_id = dp.id
        WHERE dp.id IN (1, 2, 4, 6, 8, 12, 72)
        ORDER BY dp.id ASC
      `);

      assert.strictEqual(res.rows.length, 7);

      const statusMap = {};
      for (const row of res.rows) {
        statusMap[row.id] = { pub: row.pub_status, ev: row.ev_status };
        // Concordance absolue entre le statut catalogue et le statut de preuve
        assert.strictEqual(
          row.pub_status,
          row.ev_status,
          `Incohérence pour #${row.id} : pub=${row.pub_status} vs ev=${row.ev_status}`
        );
      }

      // Publications 2 et 72 : institutional_reference_only
      assert.strictEqual(statusMap[2].pub, 'institutional_reference_only');
      assert.strictEqual(statusMap[72].pub, 'institutional_reference_only');

      // Publications 1, 4, 6, 8, 12 : unavailable
      assert.strictEqual(statusMap[1].pub, 'unavailable');
      assert.strictEqual(statusMap[4].pub, 'unavailable');
      assert.strictEqual(statusMap[6].pub, 'unavailable');
      assert.strictEqual(statusMap[8].pub, 'unavailable');
      assert.strictEqual(statusMap[12].pub, 'unavailable');
    });

    it('doit confirmer l absence totale de fichier, taille ou hash pour les 7 publications', async () => {
      const res = await pool.query(`
        SELECT id, publication_id, file_path, file_size_bytes, sha256_hash, retrieval_date
        FROM data_document_evidence
        WHERE publication_id IN (1, 2, 4, 6, 8, 12, 72)
      `);

      for (const row of res.rows) {
        assert.strictEqual(row.file_path, null, `Aucun faux chemin de fichier pour pub ${row.publication_id}`);
        assert.strictEqual(row.file_size_bytes, null, `Aucune fausse taille pour pub ${row.publication_id}`);
        assert.strictEqual(row.sha256_hash, null, `Aucun faux hash pour pub ${row.publication_id}`);
        assert.strictEqual(row.retrieval_date, null, `Aucune fausse date de récupération pour pub ${row.publication_id}`);
      }
    });
  });

  // =========================================================================
  // 2. VÉRIFICATION DE L'ARCHIVAGE PRIVÉ ET SÉCURITÉ DU STOCKAGE
  // =========================================================================
  describe('2. Vérification rigoureuse du service d archivage et intégrité', () => {
    it('doit rejeter un buffer vide (0 octet)', () => {
      const check = documentArchiveService.validatePdf(Buffer.alloc(0));
      assert.strictEqual(check.valid, false);
      assert.ok(check.error.includes('vide ou trop court'));
    });

    it('doit rejeter un fichier court ou tronqué (< 32 octets)', () => {
      const check = documentArchiveService.validatePdf(Buffer.from('%PDF-1.4 short'));
      assert.strictEqual(check.valid, false);
      assert.ok(check.error.includes('trop court'));
    });

    it('doit rejeter un fichier HTML renommé en PDF', () => {
      const htmlBuffer = Buffer.from('<!DOCTYPE html><html><head><title>Erreur 404</title></head><body>Portail INS</body></html>');
      const check = documentArchiveService.validatePdf(htmlBuffer);
      assert.strictEqual(check.valid, false);
      assert.ok(check.error.includes('Signature binaire PDF absente'));
    });

    it('doit rejeter un fichier HTML avec préfixe %PDF- (tentative de dissimulation polyglotte)', () => {
      const polyglot = Buffer.from('%PDF-1.4\n<html><body><script>alert(1)</script></body></html>\n%%EOF');
      const check = documentArchiveService.validatePdf(polyglot);
      assert.strictEqual(check.valid, false);
      assert.ok(check.error.includes('Structure HTML/XML détectée'));
    });

    it('doit rejeter un fichier PDF corrompu dépourvu du marqueur %%EOF', () => {
      const corruptPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Rapport) >>\nendobj\nCORRUPTED_STREAM_NO_EOF_TRAILER');
      const check = documentArchiveService.validatePdf(corruptPdf);
      assert.strictEqual(check.valid, false);
      assert.ok(check.error.includes('%%EOF absent'));
    });

    it('doit valider avec succès un document PDF structurellement complet', () => {
      const validPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
      const check = documentArchiveService.validatePdf(validPdf);
      assert.strictEqual(check.valid, true);
    });

    it('doit protéger contre les attaques par traversée de chemin (path traversal)', () => {
      assert.strictEqual(documentArchiveService.isPathSafe('../../etc/passwd'), false);
      assert.strictEqual(documentArchiveService.isPathSafe('..\\..\\config\\database.js'), false);
      assert.strictEqual(documentArchiveService.isPathSafe('/etc/shadow'), false);
      assert.strictEqual(documentArchiveService.isPathSafe('C:\\Windows\\System32\\calc.exe'), false);
      assert.strictEqual(documentArchiveService.isPathSafe('some/file\0.pdf'), false);

      const safePath = path.join(documentArchiveService.getArchiveDirectory(), 'pub_1_abc123.pdf');
      assert.strictEqual(documentArchiveService.isPathSafe(safePath), true);
    });

    it('doit archiver un PDF réel, vérifier son empreinte et détecter toute altération ultérieure', async () => {
      const testBuffer = Buffer.from(
        '%PDF-1.7\n1 0 obj\n<< /Title (Audit Preuve Lot 3E.2.1) >>\nendobj\ntrailer\n<< /Size 1 >>\n%%EOF'
      );
      const expectedSha256 = documentArchiveService.computeSha256(testBuffer);

      // Archiver pour le test unitaire sur la publication 72
      const archived = await documentArchiveService.archivePdfFile({
        publicationId: 72,
        indicatorId: 309,
        title: 'Quatrième Enquête Camerounaise auprès des Ménages (ECAM 4) — Rapport Emploi',
        institutionAcronym: 'INS',
        publicationYear: 2015,
        originalUrl: 'https://ins-cameroun.cm/ecam4-test.pdf',
        pdfBuffer: testBuffer,
        pageSectionReference: 'Tableau 5.3, p. 62',
        verificationNotes: 'Test unitaire Lot 3E.2.1 intégrité SHA-256 et falsification',
      });

      assert.strictEqual(archived.sha256_hash, expectedSha256);
      assert.strictEqual(Number(archived.file_size_bytes), testBuffer.length);
      assert.ok(fs.existsSync(archived.file_path));

      // 1. Vérification nominale de l intégrité : SUCCÈS
      const nominalCheck = await documentArchiveService.verifyFileIntegrity(archived.id);
      assert.strictEqual(nominalCheck.valid, true);

      // 2. Simulation d une altération / falsification de fichier sur le disque
      const tamperedBuffer = Buffer.from(
        '%PDF-1.7\n1 0 obj\n<< /Title (Falsifié) >>\nendobj\ntrailer\n<< /Size 1 >>\n%%EOF'
      );
      fs.writeFileSync(archived.file_path, tamperedBuffer);

      // Vérification post-falsification : REJET IMMÉDIAT
      const tamperedCheck = await documentArchiveService.verifyFileIntegrity(archived.id);
      assert.strictEqual(tamperedCheck.valid, false);
      assert.ok(
        tamperedCheck.reason === 'HASH_MISMATCH_TAMPERED' || tamperedCheck.reason === 'SIZE_MISMATCH',
        `Altération détectée : ${tamperedCheck.reason}`
      );

      // 3. Nettoyage et restauration de l état initial
      if (fs.existsSync(archived.file_path)) {
        fs.unlinkSync(archived.file_path);
      }
      await pool.query(`
        UPDATE data_document_evidence
        SET document_status = 'institutional_reference_only',
            file_path = NULL,
            file_size_bytes = NULL,
            sha256_hash = NULL,
            retrieval_date = NULL,
            verification_notes = 'Portail répond en redirection 301. Enregistrement canonique ECAM 4 complété (Lot 3E.2).'
        WHERE id = $1
      `, [archived.id]);
    });
  });

  // =========================================================================
  // 3. RÉVISION DE L'ANALYSE DÉMOGRAPHIQUE DE #692
  // =========================================================================
  describe('3. Analyse méthodologique rigoureuse de la population 2023 (#692)', () => {
    it('doit conserver la valeur officielle 28 088 845 sans recalcul ni extrapolation', async () => {
      const res = await pool.query(`
        SELECT id, TO_CHAR(period_start, 'YYYY-MM-DD') as period_start_str,
               value_numeric, methodology_nature, editorial_status, is_active, audit_decision
        FROM data_values
        WHERE id = 692
      `);

      assert.strictEqual(res.rows.length, 1);
      const obs = res.rows[0];
      assert.strictEqual(obs.period_start_str, '2023-01-01');
      assert.strictEqual(Number(obs.value_numeric), 28088845);
      assert.strictEqual(obs.methodology_nature, 'projection');
      assert.strictEqual(obs.editorial_status, 'draft');
      assert.strictEqual(obs.is_active, false);
      assert.strictEqual(obs.audit_decision, 'pending');
    });

    it('doit confirmer l intégrité de la série de population 2018-2023 (#687 à #692)', async () => {
      const res = await pool.query(`
        SELECT id, TO_CHAR(period_start, 'YYYY-MM-DD') as period, value_numeric
        FROM data_values
        WHERE id BETWEEN 687 AND 692
        ORDER BY id ASC
      `);

      const expected = [
        { id: 687, year: '2018-01-01', val: 24348251 },
        { id: 688, year: '2019-01-01', val: 24997937 },
        { id: 689, year: '2020-01-01', val: 25660760 },
        { id: 690, year: '2021-01-01', val: 26348251 },
        { id: 691, year: '2022-01-01', val: 27050000 },
        { id: 692, year: '2023-01-01', val: 28088845 },
      ];

      res.rows.forEach((r, idx) => {
        assert.strictEqual(Number(r.id), expected[idx].id);
        assert.strictEqual(r.period, expected[idx].year);
        assert.strictEqual(Number(r.value_numeric), expected[idx].val);
      });
    });
  });

  // =========================================================================
  // 4. VÉRIFICATION DE L'OBSERVATION HISTORIQUE #261
  // =========================================================================
  describe('4. Lecture directe et vérification intégrale de l observation #261', () => {
    it('doit confirmer que l observation #261 concerne l année 2024 (cadrage macroéconomique MINFI PLF 2025)', async () => {
      const res = await pool.query(`
        SELECT dv.id, dv.indicator_id, di.code as ind_code, di.name as ind_name, di.unit as ind_unit,
               TO_CHAR(dv.period_start, 'YYYY-MM-DD') as period_start_str,
               TO_CHAR(dv.period_end, 'YYYY-MM-DD') as period_end_str,
               dv.period_type, dv.value_numeric, dv.methodology_nature,
               dv.editorial_status, dv.is_active, dv.revision_number,
               dvs.citation_reference, dvs.documentary_tier, dvs.methodological_robustness
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        LEFT JOIN data_value_sources dvs ON dvs.data_value_id = dv.id
        WHERE dv.id = 261
      `);

      assert.strictEqual(res.rows.length, 1);
      const obs = res.rows[0];

      // Vérifications directes en base
      assert.strictEqual(obs.ind_code, 'ECO_PIB_NOM');
      assert.strictEqual(obs.ind_unit, 'milliards_fcfa');
      assert.strictEqual(Number(obs.value_numeric), 29850, 'Valeur = 29 850 milliards FCFA');
      assert.strictEqual(obs.period_type, 'ANNUAL');
      assert.strictEqual(obs.period_start_str, '2024-01-01', 'Période de référence = 2024 et NON 2022');
      assert.strictEqual(obs.period_end_str, '2024-12-31', 'Fin de période = 31 décembre 2024');
      assert.strictEqual(obs.methodology_nature, 'nowcast_estimate', 'Nature = nowcast_estimate');
      assert.strictEqual(obs.editorial_status, 'published');
      assert.strictEqual(obs.is_active, true);

      // Source primaire
      assert.ok(obs.citation_reference.includes('PLF 2025'), 'Source = PLF 2025 MINFI');
      assert.strictEqual(obs.documentary_tier, 'TIER_1_OFFICIAL');
      assert.strictEqual(obs.methodological_robustness, 'high');
    });
  });

  // =========================================================================
  // 5. VÉRIFICATION DES RELATIONS ET RATTACHEMENTS DOCUMENTAIRES
  // =========================================================================
  describe('5. Relations documentaires ECAM 4, ECAM 5 et rattachements', () => {
    it('doit relier ECAM 4 et ECAM 5 à LAB_UNEMP_RATE avec leurs sections précises', async () => {
      const res = await pool.query(`
        SELECT dpi.publication_id, dp.title, dpi.specific_section
        FROM data_publication_indicators dpi
        JOIN data_publications dp ON dp.id = dpi.publication_id
        JOIN data_indicators di ON di.id = dpi.indicator_id
        WHERE di.code = 'LAB_UNEMP_RATE' AND dpi.publication_id IN (6, 72)
        ORDER BY dpi.publication_id ASC
      `);

      assert.strictEqual(res.rows.length, 2);
      // ECAM 5 (ID 6)
      assert.strictEqual(res.rows[0].publication_id, 6);
      assert.ok(res.rows[0].specific_section.includes('Chapitre 6, Tableau 6.2, p. 84'));

      // ECAM 4 (ID 72)
      assert.strictEqual(res.rows[1].publication_id, 72);
      assert.ok(res.rows[1].specific_section.includes('Tableau 5.3, p. 62'));
    });

    it('ne doit comporter aucun doublon de publication dans data_publications', async () => {
      const res = await pool.query(`
        SELECT title, COUNT(*) as c
        FROM data_publications
        GROUP BY title
        HAVING COUNT(*) > 1
      `);
      assert.strictEqual(res.rows.length, 0, 'Aucun doublon de titre');
    });
  });

  // =========================================================================
  // 6. NON-ALTÉRATION ABSOLUE DES 24 OBSERVATIONS PILOTES
  // =========================================================================
  describe('6. Non-altération des 24 observations du pilote', () => {
    it('doit maintenir STRICTEMENT les 24 observations en draft, inactif et pending', async () => {
      const res = await pool.query(`
        SELECT id, editorial_status, is_active, audit_decision
        FROM data_values
        WHERE id BETWEEN 687 AND 710
        ORDER BY id ASC
      `);

      assert.strictEqual(res.rows.length, 24);
      for (const obs of res.rows) {
        assert.strictEqual(obs.editorial_status, 'draft', `#${obs.id} doit rester draft`);
        assert.strictEqual(obs.is_active, false, `#${obs.id} doit rester inactif`);
        assert.strictEqual(obs.audit_decision, 'pending', `#${obs.id} doit rester pending`);
      }
    });
  });
});

