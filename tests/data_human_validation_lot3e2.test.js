const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const pool = require('../backend/config/database');
const documentArchiveService = require('../backend/services/documentArchiveService');

describe('Solitiquo DATA — Lot 3E.2 : Consolidation documentaire et sécurisation des preuves', () => {

  // =========================================================================
  // 1. CORPUS DOCUMENTAIRE : ECAM 4 & ECAM 5
  // =========================================================================
  describe('1. Corpus documentaire : Enregistrement canonique ECAM 4 et liaisons', () => {
    it('doit contenir ECAM 4 dans data_publications avec ses métadonnées exactes', async () => {
      const res = await pool.query(`
        SELECT *
        FROM data_publications
        WHERE title = 'Quatrième Enquête Camerounaise auprès des Ménages (ECAM 4) — Rapport Emploi'
      `);

      assert.strictEqual(res.rows.length, 1, 'ECAM 4 doit exister en un exemplaire unique');
      const ecam4 = res.rows[0];
      assert.strictEqual(ecam4.institution_id, 282, 'Producteur = INS (ID 282)');
      assert.strictEqual(ecam4.publication_year, 2015, 'Année = 2015');
      assert.strictEqual(ecam4.document_category, 'survey', 'Catégorie = survey');
      assert.strictEqual(
        ecam4.verification_status,
        'institutional_reference_only',
        'Statut de vérification = institutional_reference_only (portail sans PDF consulté, Lot 3E.2.1)'
      );
      assert.ok(ecam4.url.includes('ins-cameroun.cm'), 'URL officielle INS');
    });

    it('doit relier ECAM 4 à l indicateur LAB_UNEMP_RATE dans data_publication_indicators', async () => {
      const res = await pool.query(`
        SELECT dpi.*, dp.title, di.code
        FROM data_publication_indicators dpi
        JOIN data_publications dp ON dp.id = dpi.publication_id
        JOIN data_indicators di ON di.id = dpi.indicator_id
        WHERE dp.title = 'Quatrième Enquête Camerounaise auprès des Ménages (ECAM 4) — Rapport Emploi'
          AND di.code = 'LAB_UNEMP_RATE'
      `);

      assert.strictEqual(res.rows.length, 1, 'Liaison ECAM 4 <-> LAB_UNEMP_RATE unique');
      assert.ok(res.rows[0].specific_section.includes('Tableau 5.3'), 'Section spécifique documentée (Tableau 5.3)');
    });

    it('doit relier ECAM 5 (publication ID 6) à l indicateur LAB_UNEMP_RATE', async () => {
      const res = await pool.query(`
        SELECT dpi.*, dp.title, di.code
        FROM data_publication_indicators dpi
        JOIN data_publications dp ON dp.id = dpi.publication_id
        JOIN data_indicators di ON di.id = dpi.indicator_id
        WHERE dpi.publication_id = 6
          AND di.code = 'LAB_UNEMP_RATE'
      `);

      assert.strictEqual(res.rows.length, 1, 'Liaison ECAM 5 <-> LAB_UNEMP_RATE unique');
      assert.ok(res.rows[0].title.includes('ECAM 5'), 'Publication = ECAM 5');
      assert.ok(res.rows[0].specific_section.includes('Chapitre 6'), 'Section spécifique documentée (Chapitre 6, Tab. 6.2)');
    });

    it('ne doit avoir aucun doublon de publication dans data_publications', async () => {
      const res = await pool.query(`
        SELECT title, COUNT(*) as count
        FROM data_publications
        GROUP BY title
        HAVING COUNT(*) > 1
      `);

      assert.strictEqual(res.rows.length, 0, 'Aucun doublon de titre dans data_publications');
    });
  });

  // =========================================================================
  // 2. REGISTRE D'ARCHIVAGE DOCUMENTAIRE (data_document_evidence)
  // =========================================================================
  describe('2. Registre et statuts d archivage documentaire', () => {
    it('doit contenir exactement 7 documents audités couvrant les 24 observations', async () => {
      const res = await pool.query(`SELECT COUNT(*)::INTEGER as count FROM data_document_evidence`);
      assert.strictEqual(res.rows[0].count, 7, '7 publications auditées');
    });

    it('doit respecter strictement les 4 statuts documentaires autorisés', async () => {
      const res = await pool.query(`
        SELECT DISTINCT document_status FROM data_document_evidence
      `);
      const validStatuses = new Set([
        'original_consulted',
        'original_accessible_unconsulted',
        'institutional_reference_only',
        'unavailable',
      ]);
      for (const row of res.rows) {
        assert.ok(validStatuses.has(row.document_status), `Statut valide : ${row.document_status}`);
      }
    });

    it('doit classifier honnêtement les documents selon l audit réel de connectivité', async () => {
      const summary = await documentArchiveService.getEvidenceAuditSummary();
      
      // 0 PDF authentique hébergé en local à la clôture du lot (aucun faux PDF)
      assert.strictEqual(summary.summary.original_consulted, 0, 'Aucun document faussement marqué original_consulted');
      // 2 références institutionnelles (pages HTML / portails)
      assert.strictEqual(summary.summary.institutional_reference_only, 2, '2 documents en référence institutionnelle');
      // 5 indisponibles (serveurs inaccessibles, timeouts, certificats invalides, DNS)
      assert.strictEqual(summary.summary.unavailable, 5, '5 documents inaccessibles en ligne');
      assert.strictEqual(summary.summary.total, 7, 'Total = 7 documents');
    });

    it('doit documenter explicitement les motifs d inaccessibilité et références de page', async () => {
      const evidences = await documentArchiveService.getAllEvidences();
      for (const ev of evidences) {
        assert.ok(ev.page_section_reference && ev.page_section_reference.length > 0, `Section de page requise pour ${ev.title}`);
        assert.ok(ev.verification_notes && ev.verification_notes.length > 0, `Notes de vérification requises pour ${ev.title}`);
      }
    });
  });

  // =========================================================================
  // 3. SERVICE D'ARCHIVAGE ET SÉCURITÉ DE STOCKAGE PRIVÉ
  // =========================================================================
  describe('3. Service d archivage sécurisé et intégrité SHA-256', () => {
    it('doit calculer une empreinte SHA-256 déterministe', () => {
      const sample = 'Solitiquo Data Evidence Test';
      const hash = documentArchiveService.computeSha256(sample);
      assert.strictEqual(hash.length, 64, 'Longueur SHA-256 = 64 caractères hex');
      assert.strictEqual(hash, documentArchiveService.computeSha256(Buffer.from(sample)));
    });

    it('doit rejeter toute tentative d archiver un fichier HTML ou corrompu comme PDF', async () => {
      const fakePdfBuffer = Buffer.from('<!DOCTYPE html><html><body>Portail INS</body></html>');
      assert.strictEqual(documentArchiveService.isValidPdf(fakePdfBuffer), false, 'HTML non reconnu comme PDF');

      await assert.rejects(
        async () => {
          await documentArchiveService.archivePdfFile({
            publicationId: 2,
            title: 'Faux PDF Test',
            institutionAcronym: 'INS',
            originalUrl: 'https://ins-cameroun.cm/fake.html',
            pdfBuffer: fakePdfBuffer,
          });
        },
        /Intégrité documentaire violée/
      );
    });

    it('doit archiver avec succès un vrai document PDF et tracer son hash SHA-256', async () => {
      // PDF minimal valide conforme à la spécification ISO (%PDF-1.4 ... %%EOF)
      const validPdfBuffer = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
      );
      assert.strictEqual(documentArchiveService.isValidPdf(validPdfBuffer), true, 'Vrai PDF reconnu');

      const archived = await documentArchiveService.archivePdfFile({
        publicationId: 72,
        indicatorId: 309,
        title: 'Quatrième Enquête Camerounaise auprès des Ménages (ECAM 4) — Rapport Emploi',
        institutionAcronym: 'INS',
        publicationYear: 2015,
        originalUrl: 'https://ins-cameroun.cm/ecam4-test.pdf',
        pdfBuffer: validPdfBuffer,
        pageSectionReference: 'Tableau 5.3, p. 62',
        verificationNotes: 'Test unitaire d archivage réel avec intégrité SHA-256',
      });

      assert.strictEqual(archived.document_status, 'original_consulted');
      assert.ok(archived.sha256_hash.length === 64);
      assert.ok(Number(archived.file_size_bytes) > 0);
      assert.ok(fs.existsSync(archived.file_path), 'Fichier présent sur le disque privé');

      // Nettoyage après test
      if (fs.existsSync(archived.file_path)) {
        fs.unlinkSync(archived.file_path);
      }
      // Rétablir le statut initial institutional_reference_only pour publication 72
      await pool.query(`
        UPDATE data_document_evidence
        SET document_status = 'institutional_reference_only',
            file_path = NULL,
            file_size_bytes = NULL,
            sha256_hash = NULL,
            retrieval_date = NULL,
            verification_notes = 'Portail répond en redirection 301. Enregistrement canonique ECAM 4 complété (Lot 3E.2).'
        WHERE publication_id = 72
      `);
    });

    it('doit garantir que le dossier d archivage est privé et hors exposition statique', () => {
      const archiveDir = documentArchiveService.getArchiveDirectory();
      assert.ok(archiveDir.includes('document_archive'));
      assert.ok(fs.existsSync(archiveDir), 'Répertoire physique existant');
      
      const serverCode = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
      assert.ok(
        serverCode.includes("req.path.startsWith('/backend')"),
        'server.js bloque expressément l accès à /backend'
      );
      assert.ok(
        serverCode.includes('/uploads/document_archive') || serverCode.includes('/backend/storage'),
        'server.js bloque expressément l accès aux archives de stockage'
      );
    });
  });

  // =========================================================================
  // 4. COHÉRENCE MÉTHODOLOGIQUE & POPULATION 2023
  // =========================================================================
  describe('4. Cohérence méthodologique et population 2023', () => {
    it('doit maintenir la population 2023 (#692) intacte en draft pending', async () => {
      const res = await pool.query(`
        SELECT id, TO_CHAR(period_start, 'YYYY-MM-DD') as period_start_str, value_numeric, editorial_status, is_active, audit_decision
        FROM data_values
        WHERE id = 692
      `);
      assert.strictEqual(res.rows.length, 1);
      const row = res.rows[0];
      assert.strictEqual(row.period_start_str, '2023-01-01');
      assert.strictEqual(Number(row.value_numeric), 28088845);
      assert.strictEqual(row.editorial_status, 'draft');
      assert.strictEqual(row.is_active, false);
      assert.strictEqual(row.audit_decision, 'pending');
    });

    it('doit maintenir les données scolaires (#706-#710) avec robustesse medium et statut draft', async () => {
      const res = await pool.query(`
        SELECT dv.id, dvs.methodological_robustness, dv.editorial_status, dv.is_active, dv.audit_decision
        FROM data_values dv
        JOIN data_value_sources dvs ON dvs.data_value_id = dv.id
        WHERE dv.id BETWEEN 706 AND 710
      `);
      assert.strictEqual(res.rows.length, 5, 'Exactement 5 observations scolaires');
      for (const row of res.rows) {
        assert.strictEqual(row.methodological_robustness, 'medium', 'Robustesse medium préservée');
        assert.strictEqual(row.editorial_status, 'draft', 'Statut draft préservé');
        assert.strictEqual(row.is_active, false, 'Inactif préservé');
        assert.strictEqual(row.audit_decision, 'pending', 'Décision pending préservée');
      }
    });
  });

  // =========================================================================
  // 5. NON-RÉGRESSION ABSOLUE DES 24 OBSERVATIONS ET DE #261
  // =========================================================================
  describe('5. Non-régression absolue des observations pilotes et de l observation historique #261', () => {
    it('doit préserver les 24 observations pilotes (#687 à #710) strictement en draft inactif et audit pending', async () => {
      const res = await pool.query(`
        SELECT id, editorial_status, is_active, audit_decision
        FROM data_values
        WHERE id BETWEEN 687 AND 710
        ORDER BY id ASC
      `);
      assert.strictEqual(res.rows.length, 24, 'Exactement 24 observations');
      for (const row of res.rows) {
        assert.strictEqual(row.editorial_status, 'draft', `Obs #${row.id} doit rester draft`);
        assert.strictEqual(row.is_active, false, `Obs #${row.id} doit rester inactive`);
        assert.strictEqual(row.audit_decision, 'pending', `Obs #${row.id} doit rester pending`);
      }
    });

    it('doit préserver intacte l observation historique #261 publiée et active à 29850 Mrds', async () => {
      const res = await pool.query(`
        SELECT id, value_numeric, editorial_status, is_active, audit_decision
        FROM data_values
        WHERE id = 261
      `);
      assert.strictEqual(res.rows.length, 1);
      const row = res.rows[0];
      assert.strictEqual(Number(row.value_numeric), 29850, 'Valeur = 29850');
      assert.strictEqual(row.editorial_status, 'published', 'Statut = published');
      assert.strictEqual(row.is_active, true, 'is_active = true');
    });
  });
});
