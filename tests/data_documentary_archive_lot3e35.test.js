'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const pool = require('../backend/config/database');
const documentArchiveService = require('../backend/services/documentArchiveService');
const { getAdminValueById } = require('../backend/services/dataAdminService');

test('LOT 3E.3.5 — COLLECTE, ARCHIVAGE ET VÉRIFICATION MATÉRIELLE DES SOURCES DOCUMENTAIRES', async (t) => {
  const ids = [693, 694, 695, 696, 698, 699, 700, 701, 706, 707, 708, 709, 710];

  await t.test('1. Validation stricte des fichiers PDF et rejet des fichiers invalides', () => {
    // 1.1 Vrai PDF valide
    const validPdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\nstartxref\n50\n%%EOF');
    const validRes = documentArchiveService.validatePdf(validPdfBuffer);
    assert.equal(validRes.valid, true);

    // 1.2 Fichier HTML pur sans signature PDF
    const htmlDisguised = Buffer.from('<!DOCTYPE html><html><head><title>404</title></head><body>%%EOF</body></html>');
    const htmlRes = documentArchiveService.validatePdf(htmlDisguised);
    assert.equal(htmlRes.valid, false);
    assert.match(htmlRes.error, /Signature binaire PDF absente/);

    // 1.3 Fichier HTML dissimulé sous un en-tête PDF
    const htmlFakeHeader = Buffer.from('%PDF-1.4 <!DOCTYPE html><html><body>%%EOF</body></html>');
    const fakeRes = documentArchiveService.validatePdf(htmlFakeHeader);
    assert.equal(fakeRes.valid, false);
    assert.match(fakeRes.error, /Structure HTML\/XML détectée/);

    // 1.4 Fichier trop court
    const shortBuffer = Buffer.from('%PDF-1.4 short');
    const shortRes = documentArchiveService.validatePdf(shortBuffer);
    assert.equal(shortRes.valid, false);

    // 1.5 PDF tronqué sans marqueur de fin %%EOF
    const truncatedBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>');
    const truncRes = documentArchiveService.validatePdf(truncatedBuffer);
    assert.equal(truncRes.valid, false);
    assert.match(truncRes.error, /Marqueur de fin %%EOF absent/);
  });

  await t.test('2. Calcul SHA-256 et vérification de la protection contre les traversées de répertoire', () => {
    const data = Buffer.from('TEST_PDF_BUFFER_CONTENT');
    const hash = documentArchiveService.computeSha256(data);
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);

    const archiveDir = documentArchiveService.getArchiveDirectory();
    assert.ok(fs.existsSync(archiveDir), 'Le répertoire de stockage privé doit exister');

    // Vérifier que le dossier d\'archivage n\'est pas exposé dans les répertoires publics
    const isInsidePublic = archiveDir.includes(path.join('public', 'storage')) || archiveDir.includes(path.join('frontend', 'storage'));
    assert.equal(isInsidePublic, false, 'Le stockage privé ne doit pas être sous un dossier public');

    // Test de détection de traversée de chemin
    const safePath = path.join(archiveDir, 'pub_999_abcdef0123456789.pdf');
    assert.equal(documentArchiveService.isPathSafe(safePath), true);

    const traversalPath = path.join(archiveDir, '..', '..', 'secret.txt');
    assert.equal(documentArchiveService.isPathSafe(traversalPath), false);
  });

  await t.test('3. Cycle d\'archivage et contrôle d\'intégrité matérielle verifyFileIntegrity', async () => {
    const testPdf = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Title (Document Test Archivage) >>\nendobj\ntrailer\n<<>>\nstartxref\n60\n%%EOF');
    const hash = documentArchiveService.computeSha256(testPdf);

    let testPubId;
    let archivedId;
    let filePath;

    try {
      // Créer une publication temporaire dédiée pour ce test unitaire afin de ne pas toucher aux publications réelles
      const pubRes = await pool.query(`
        INSERT INTO data_publications (title, institution_id, document_category, publication_year, verification_status)
        VALUES ('Test Unitaire Archivage Lot 3E.3.5', 1, 'national_accounts', 2023, 'institutional_reference_only')
        RETURNING id
      `);
      testPubId = pubRes.rows[0].id;

      // Archiver le document test pour la publication dédiée
      const archived = await documentArchiveService.archivePdfFile({
        publicationId: testPubId,
        indicatorId: 137,
        title: 'Document Test Lot 3E.3.5',
        institutionAcronym: 'INS',
        publicationYear: 2023,
        originalUrl: 'https://ins-cameroun.cm/comptes-nationaux/',
        pdfBuffer: testPdf,
        pageSectionReference: 'Tableau Test',
        verificationNotes: 'Test unitaire temporaire archivage'
      });

      archivedId = archived.id;
      filePath = archived.file_path;

      assert.ok(archived.id);
      assert.equal(archived.document_status, 'original_consulted');
      assert.equal(archived.sha256_hash, hash);
      assert.ok(fs.existsSync(filePath));

      // Vérifier l\'intégrité matérielle
      const integrityCheck = await documentArchiveService.verifyFileIntegrity(archivedId);
      assert.equal(integrityCheck.valid, true);

      // Simuler une altération du fichier pour tester la détection de falsification
      fs.appendFileSync(filePath, '\nTAMPERED_CONTENT');
      const tamperedCheck = await documentArchiveService.verifyFileIntegrity(archivedId);
      assert.equal(tamperedCheck.valid, false);
      assert.equal(tamperedCheck.reason, 'SIZE_MISMATCH');
    } finally {
      // Nettoyer le fichier physique, la preuve et la publication temporaire
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // Ignorer l'erreur de suppression temporaire
        }
      }
      if (archivedId) {
        await pool.query('DELETE FROM data_document_evidence WHERE id = $1', [archivedId]);
      }
      if (testPubId) {
        await pool.query('DELETE FROM data_publications WHERE id = $1', [testPubId]);
      }
    }
  });

  await t.test('4. Contrôle des statuts documentaires des 3 publications (#1, #2, #12)', async () => {
    const res = await pool.query(`
      SELECT id, title, verification_status
      FROM data_publications
      WHERE id IN (1, 2, 12)
      ORDER BY id
    `);

    assert.equal(res.rows.length, 3);
    const pubMap = new Map(res.rows.map(r => [r.id, r.verification_status]));
    assert.equal(pubMap.get(1), 'unavailable', 'Publication #1 (Annuaire 2023) doit être unavailable');
    assert.equal(pubMap.get(2), 'institutional_reference_only', 'Publication #2 (Comptes 2022) doit être institutional_reference_only');
    assert.equal(pubMap.get(12), 'unavailable', 'Publication #12 (Annuaire MINEDUB) doit être unavailable');
  });

  await t.test('5. Évaluation de preuve et confrontation pour les 13 observations', async () => {
    for (const id of ids) {
      const val = await getAdminValueById(id);
      assert.ok(val);
      const ev = val.evidence_evaluation;
      assert.equal(ev.is_pdf_archived, false, `PDF original ne doit pas être marqué archivé pour #${id}`);
      assert.equal(ev.proposed_decision, 'pending_evidence', `Orientation proposée doit être pending_evidence pour #${id}`);
      assert.equal(ev.confrontation_result, 'not_verifiable', `Résultat de confrontation matérielle directe doit être not_verifiable pour #${id}`);
      assert.ok(ev.confrontation_details && ev.confrontation_details.length > 10);
    }
  });

  await t.test('6. Sanctuarisation absolue : 24 observations pilotes et #261 intègres', async () => {
    const checkRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE id BETWEEN 687 AND 710) as total_pilots,
        COUNT(*) FILTER (WHERE id BETWEEN 687 AND 710 AND editorial_status = 'draft') as draft_pilots,
        COUNT(*) FILTER (WHERE id BETWEEN 687 AND 710 AND is_active = false) as inactive_pilots,
        COUNT(*) FILTER (WHERE id BETWEEN 687 AND 710 AND audit_decision = 'pending') as pending_decision_pilots,
        COUNT(*) FILTER (WHERE id = 261 AND editorial_status = 'published' AND is_active = true) as obs_261_published,
        (SELECT value_numeric FROM data_values WHERE id = 261) as obs_261_value
      FROM data_values
    `);

    const r = checkRes.rows[0];
    assert.equal(Number(r.total_pilots), 24);
    assert.equal(Number(r.draft_pilots), 24);
    assert.equal(Number(r.inactive_pilots), 24);
    assert.equal(Number(r.pending_decision_pilots), 24);
    assert.equal(Number(r.obs_261_published), 1);
    assert.equal(Number(r.obs_261_value), 29850);
  });
});
