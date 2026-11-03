/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 2D MODULE D'IMPORTATION ET D'INGESTION TESTS
 * =============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 2D DATA IMPORT & INGESTION SUITE', () => {
  const suffix = Date.now().toString().slice(-6);
  const rawPassword = 'Password123*';
  let adminUser;
  let adminAgent;
  let adminCsrf;
  let writerUser;
  let writerAgent;
  let writerCsrf;
  let readerAgent;

  let testIndicatorCode;
  let testIndicatorId;
  let testTerritoryCode;
  let testTerritoryId;
  let testSourceId;

  before(async () => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // 1. Utilisateurs
    const uAdmin = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
    `, [`admin_imp_${suffix}`, `admin_imp_${suffix}@solitiquo.cm`, hashedPassword]);
    adminUser = uAdmin.rows[0];

    const uWriter = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'writer', TRUE) RETURNING id, username, email, role
    `, [`writer_imp_${suffix}`, `writer_imp_${suffix}@solitiquo.cm`, hashedPassword]);
    writerUser = uWriter.rows[0];

    const uReader = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'reader', TRUE) RETURNING id, username, email, role
    `, [`reader_imp_${suffix}`, `reader_imp_${suffix}@solitiquo.cm`, hashedPassword]);

    // Sessions & CSRF
    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({
      email: adminUser.email,
      password: rawPassword
    }).expect(200);
    const csrfAdminRes = await adminAgent.get('/api/csrf-token').expect(200);
    adminCsrf = csrfAdminRes.body.csrfToken;

    writerAgent = request.agent(app);
    await writerAgent.post('/api/auth/login').send({
      email: writerUser.email,
      password: rawPassword
    }).expect(200);
    const csrfWriterRes = await writerAgent.get('/api/csrf-token').expect(200);
    writerCsrf = csrfWriterRes.body.csrfToken;

    readerAgent = request.agent(app);
    await readerAgent.post('/api/auth/login').send({
      email: uReader.rows[0].email,
      password: rawPassword
    }).expect(200);

    // 2. Référentiels dédiés pour les tests d'import
    testIndicatorCode = `IND_IMP_${suffix}`;
    const indRes = await pool.query(`
      INSERT INTO data_indicators (code, name, category, unit, is_active)
      VALUES ($1, 'Indicateur Import Test', 'economie', 'unités', TRUE)
      RETURNING id, code
    `, [testIndicatorCode]);
    testIndicatorId = indRes.rows[0].id;

    const terRes = await pool.query(`SELECT id, code FROM territories WHERE code = 'CMR' LIMIT 1`);
    testTerritoryId = terRes.rows[0].id;
    testTerritoryCode = terRes.rows[0].code;

    const srcRes = await pool.query(`SELECT id FROM data_sources LIMIT 1`);
    testSourceId = srcRes.rows[0].id;
  });

  after(async () => {
    // Nettoyage des données de test
    try {
      if (testIndicatorId) {
        await pool.query(`DELETE FROM data_value_sources WHERE data_value_id IN (SELECT id FROM data_values WHERE indicator_id = $1)`, [testIndicatorId]);
        await pool.query(`DELETE FROM data_value_audit_log WHERE data_value_id IN (SELECT id FROM data_values WHERE indicator_id = $1)`, [testIndicatorId]);
        await pool.query(`DELETE FROM import_lines WHERE data_value_id IN (SELECT id FROM data_values WHERE indicator_id = $1)`, [testIndicatorId]);
        await pool.query(`DELETE FROM data_values WHERE indicator_id = $1`, [testIndicatorId]);
        await pool.query(`DELETE FROM data_indicators WHERE id = $1`, [testIndicatorId]);
      }
    } catch (e) {
      // Ignorer
    }
  });

  // ============================================================
  // 1. SÉCURITÉ & PERMISSIONS
  // ============================================================
  describe('Sécurité et Gouvernance d\'accès', () => {
    test('403 — Rejet d\'un utilisateur anonyme sur le téléversement', async () => {
      await request(app)
        .post('/api/data/admin/imports/upload')
        .expect(403);
    });

    test('403 — Rejet d\'un lecteur (reader) sur le téléversement', async () => {
      await readerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', adminCsrf)
        .expect(403);
    });

    test('403 — Rejet si token CSRF manquant sur le téléversement', async () => {
      await writerAgent
        .post('/api/data/admin/imports/upload')
        .attach('file', Buffer.from('code,valeur\n'), 'test.csv')
        .expect(403);
    });
  });

  // ============================================================
  // 2. CONTRÔLE DES FICHIERS & UPLOAD
  // ============================================================
  describe('Contrôle des Fichiers et Upload', () => {
    test('400 — Rejet d\'une requête sans fichier', async () => {
      const res = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.match(res.body.error, /Aucun fichier/);
    });

    test('400 — Rejet d\'une extension interdite (ex: .exe, .sh)', async () => {
      const res = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', Buffer.from('echo malicieux'), 'script.sh')
        .expect(400);

      assert.equal(res.body.success, false);
    });

    test('400 — Rejet d\'un fichier vide (0 octet)', async () => {
      const res = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', Buffer.alloc(0), 'vide.csv')
        .expect(400);

      assert.equal(res.body.success, false);
      assert.match(res.body.error, /vide/i);
    });
  });

  // ============================================================
  // 3. PARSING CSV & EXCEL
  // ============================================================
  describe('Parsing et Prévisualisation CSV & Excel (XLSX)', () => {
    let csvBatchId;
    let xlsxBatchId;

    test('201 — Téléversement et prévisualisation d\'un fichier CSV valide', async () => {
      const csvContent = [
        'indicateur;territoire;annee;valeur;methode;notes',
        `${testIndicatorCode};CMR;2024;150000;administrative_record;Donnée 2024`,
        `${testIndicatorCode};CMR;2023;142000;administrative_record;Donnée 2023`,
        `${testIndicatorCode};CMR;2022;135000;administrative_record;Donnée 2022`
      ].join('\n');

      const res = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', Buffer.from(csvContent, 'utf-8'), 'donnees_test.csv')
        .expect(201);

      assert.equal(res.body.success, true);
      assert.ok(res.body.data.batch);
      assert.equal(res.body.data.batch.status, 'uploaded');
      assert.equal(res.body.data.headers.length, 6);
      assert.equal(res.body.data.previewRows.length, 3);
      csvBatchId = res.body.data.batch.id;
    });

    test('201 — Téléversement et prévisualisation d\'un fichier Excel XLSX valide', async () => {
      // Construction d'un classeur XLSX en mémoire
      const wb = XLSX.utils.book_new();
      const wsData = [
        ['code_ind', 'territoire', 'annee', 'valeur_num', 'notes'],
        [testIndicatorCode, 'CMR', 2024, 250000, 'Excel ligne 1'],
        [testIndicatorCode, 'CMR', 2023, 240000, 'Excel ligne 2']
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Donnees');
      const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const res = await adminAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', adminCsrf)
        .attach('file', excelBuffer, 'stats_cameroun.xlsx')
        .expect(201);

      assert.equal(res.body.success, true);
      assert.ok(res.body.data.batch);
      assert.equal(res.body.data.headers.length, 5);
      assert.equal(res.body.data.previewRows.length, 2);
      xlsxBatchId = res.body.data.batch.id;
    });
  });

  // ============================================================
  // 4. MAPPING, VALIDATION & GESTION DES ANOMALIES
  // ============================================================
  describe('Validation des Anomalies et Doublons', () => {
    let mixedBatchId;

    before(async () => {
      // Lot mixte avec lignes valides, erreurs d'indicateur, erreurs de date, erreurs de valeur, et doublons
      const csvContent = [
        'code_indicateur;code_territoire;annee_debut;annee_fin;montant;motif_absence;methodologie',
        `${testIndicatorCode};CMR;2024-01-01;2024-12-31;1000;;administrative_record`, // Valide 1
        `INCONNU_XYZ;CMR;2024-01-01;2024-12-31;2000;;administrative_record`,         // Erreur 1: indicateur inconnu
        `${testIndicatorCode};TER_INCONNU;2024-01-01;2024-12-31;3000;;administrative_record`, // Erreur 2: territoire inconnu
        `${testIndicatorCode};CMR;date_invalide;2024-12-31;4000;;administrative_record`, // Erreur 3: date invalide
        `${testIndicatorCode};CMR;2025-01-01;2024-01-01;5000;;administrative_record`, // Erreur 4: chronologie inversée
        `${testIndicatorCode};CMR;2023-01-01;2023-12-31;;;administrative_record`,      // Erreur 5: pas de valeur ni motif
        `${testIndicatorCode};CMR;2022-01-01;2022-12-31;;motif_bidon;administrative_record`, // Erreur 6: motif absence non autorisé
        `${testIndicatorCode};CMR;2021-01-01;2021-12-31;;confidential;administrative_record`, // Valide 2: missing_reason conforme
        `${testIndicatorCode};CMR;2024-01-01;2024-12-31;9999;;administrative_record`  // Erreur 7: doublon intra-lot avec Valide 1
      ].join('\n');

      const uploadRes = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', Buffer.from(csvContent, 'utf-8'), 'lot_anomalies.csv')
        .expect(201);

      mixedBatchId = uploadRes.body.data.batch.id;
    });

    test('200 — Validation du lot : détection exacte des erreurs, doublons et lignes valides', async () => {
      const mapping = {
        indicator_code: 'code_indicateur',
        territory_code: 'code_territoire',
        period_start: 'annee_debut',
        period_end: 'annee_fin',
        value_numeric: 'montant',
        missing_reason: 'motif_absence',
        methodology_nature: 'methodologie'
      };

      const res = await writerAgent
        .post(`/api/data/admin/imports/${mixedBatchId}/validate`)
        .set('x-csrf-token', writerCsrf)
        .send({ mapping, defaults: { source_id: testSourceId } })
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.totalLines, 9);
      assert.equal(res.body.data.validLines, 2); // Valide 1 et Valide 2
      assert.equal(res.body.data.errorLines, 7);
      assert.equal(res.body.data.status, 'validated');
    });

    test('200 — Téléchargement des lignes rejetées en CSV avec motif d\'erreur', async () => {
      const res = await writerAgent
        .get(`/api/data/admin/imports/${mixedBatchId}/rejected.csv`)
        .expect(200);

      assert.match(res.headers['content-type'], /text\/csv/);
      assert.match(res.headers['content-disposition'], /rejets-import-lot/);
      assert.ok(res.text.includes('INCONNU_XYZ'));
      assert.ok(res.text.includes('TER_INCONNU'));
      assert.ok(res.text.includes('Erreur_Constatee'));
    });
  });

  // ============================================================
  // 5. APPLICATION ATOMIQUE & INTÉGRITÉ ÉDITORIALE
  // ============================================================
  describe('Application Atomique et Création Exclusive de Brouillons', () => {
    let cleanBatchId;

    before(async () => {
      const csvContent = [
        'indicateur;territoire;annee;valeur;notes',
        `${testIndicatorCode};CMR;2020;111.11;Note ligne 1`,
        `${testIndicatorCode};CMR;2019;222.22;Note ligne 2`
      ].join('\n');

      const uploadRes = await adminAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', adminCsrf)
        .attach('file', Buffer.from(csvContent, 'utf-8'), 'lot_propre.csv')
        .expect(201);

      cleanBatchId = uploadRes.body.data.batch.id;

      await adminAgent
        .post(`/api/data/admin/imports/${cleanBatchId}/validate`)
        .set('x-csrf-token', adminCsrf)
        .send({
          mapping: {
            indicator_code: 'indicateur',
            territory_code: 'territoire',
            year: 'annee',
            value_numeric: 'valeur',
            notes: 'notes'
          },
          defaults: {
            methodology_nature: 'administrative_record',
            source_id: testSourceId
          }
        })
        .expect(200);
    });

    test('200 — Ingestion réussie : les observations sont STRICTEMENT créées au statut "draft"', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/imports/${cleanBatchId}/apply`)
        .set('x-csrf-token', adminCsrf)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.status, 'applied');
      assert.equal(res.body.data.importedCount, 2);

      // Vérification directe en base de données
      const dbCheck = await pool.query(`
        SELECT dv.id, dv.editorial_status, dv.is_active, dv.value_numeric, il.raw_payload
        FROM data_values dv
        JOIN import_lines il ON il.data_value_id = dv.id
        WHERE il.batch_id = $1
      `, [cleanBatchId]);

      assert.equal(dbCheck.rows.length, 2);
      for (const row of dbCheck.rows) {
        assert.equal(row.editorial_status, 'draft', 'Les données importées doivent obligatoirement être au statut draft');
        assert.equal(row.is_active, false, 'Les données importées ne doivent JAMAIS être actives sans validation');
        assert.ok(row.raw_payload, 'Les données brutes d\'origine doivent être conservées');
      }

      // Vérification du journal d'audit
      const auditCheck = await pool.query(`
        SELECT al.action, al.old_status, al.new_status
        FROM data_value_audit_log al
        JOIN import_lines il ON il.data_value_id = al.data_value_id
        WHERE il.batch_id = $1
      `, [cleanBatchId]);

      assert.equal(auditCheck.rows.length, 2);
      assert.equal(auditCheck.rows[0].action, 'CREATE');
      assert.equal(auditCheck.rows[0].new_status, 'draft');
    });

    test('400 — Protection idempotence : interdiction d\'appliquer un lot déjà au statut "applied"', async () => {
      const res = await adminAgent
        .post(`/api/data/admin/imports/${cleanBatchId}/apply`)
        .set('x-csrf-token', adminCsrf)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.match(res.body.error, /déjà été appliqué/);
    });
  });

  // ============================================================
  // 6. CONSULTATION ET HISTORIQUE DES LOTS
  // ============================================================
  describe('Consultation et Historique des Lots', () => {
    test('200 — GET /api/data/admin/imports retourne la liste paginée des lots', async () => {
      const res = await writerAgent
        .get('/api/data/admin/imports?limit=10')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 1);
      assert.ok(res.body.meta.total >= 1);
    });

    test('200 — GET /api/data/admin/imports/:id retourne le lot et ses lignes brutes', async () => {
      const batchesRes = await writerAgent.get('/api/data/admin/imports').expect(200);
      const firstBatch = batchesRes.body.data[0];

      const res = await writerAgent
        .get(`/api/data/admin/imports/${firstBatch.id}`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.ok(res.body.data.batch);
      assert.ok(Array.isArray(res.body.data.lines));
    });
  });

  // ============================================================
  // 7. CONSOLIDATION DU MOTEUR D'IMPORTATION (LOT 2D.1)
  // ============================================================
  describe('SOLITIQUO DATA — LOT 2D.1 CONSOLIDATION SUITE', () => {
    // Helper pour générer un header ZIP OpenXML
    function createMockZip({ fileName = '[Content_Types].xml', uncompressedSize = 10, compressedSize = 10 } = {}) {
      const nameBuf = Buffer.from(fileName, 'utf8');
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0, 6);
      header.writeUInt16LE(0, 8);
      header.writeUInt16LE(0, 10);
      header.writeUInt16LE(0, 12);
      header.writeUInt32LE(0, 14);
      header.writeUInt32LE(compressedSize, 18);
      header.writeUInt32LE(uncompressedSize, 22);
      header.writeUInt16LE(nameBuf.length, 26);
      header.writeUInt16LE(0, 28);
      const data = Buffer.alloc(compressedSize, 0x41);
      return Buffer.concat([header, nameBuf, data]);
    }

    test('400 — Fichier falsifié : binaire exécutable PE (MZ), script shell ou binaire déguisé en CSV', async () => {
      // 1. Exécutable Windows PE (MZ) renommé en .csv
      const fakeExe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00');
      const resExe = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', fakeExe, 'malware.csv')
        .expect(400);

      assert.equal(resExe.body.success, false);
      assert.match(resExe.body.error, /exécutable Windows \(MZ\/PE\)/i);

      // 2. Script shell exécutable renommé en .csv
      const fakeScript = Buffer.from('#!/bin/bash\necho "exploit"\n');
      const resScript = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', fakeScript, 'attack.csv')
        .expect(400);

      assert.equal(resScript.body.success, false);
      assert.match(resScript.body.error, /script exécutable/i);

      // 3. Fichier texte déguisé en .xlsx (signature PK manquante)
      const fakeXlsx = Buffer.from('Ce n\'est pas un fichier excel');
      const resXlsx = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', fakeXlsx, 'fake.xlsx')
        .expect(400);

      assert.equal(resXlsx.body.success, false);
      assert.match(resXlsx.body.error, /archive OpenXML PK attendue/i);
    });

    test('400 — Fichier XLSX malformé : structure ZIP corrompue ou archive non-Excel', async () => {
      // 1. ZIP tronqué
      const truncatedZip = Buffer.from('PK\x03\x04\x14\x00\x00\x00\x08\x00');
      const resTruncated = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', truncatedZip, 'truncated.xlsx')
        .expect(400);

      assert.equal(resTruncated.body.success, false);
      assert.match(resTruncated.body.error, /Structure ZIP/i);

      // 2. ZIP valide mais sans structure OpenXML (pas de [Content_Types].xml ni xl/)
      const nonExcelZip = createMockZip({ fileName: 'documents/notes.txt' });
      const resNonExcel = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', nonExcelZip, 'not_excel.xlsx')
        .expect(400);

      assert.equal(resNonExcel.body.success, false);
      assert.match(resNonExcel.body.error, /OpenXML valide/i);
    });

    test('400 — Archive excessivement volumineuse (protection Bombe de décompression / Zip bomb)', async () => {
      // Simule une entrée ZIP avec taille décompressée de 60 Mo (> limite de 50 Mo)
      const zipBomb = createMockZip({
        fileName: '[Content_Types].xml',
        uncompressedSize: 60 * 1024 * 1024,
        compressedSize: 100
      });

      const resBomb = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', zipBomb, 'decompression_bomb.xlsx')
        .expect(400);

      assert.equal(resBomb.body.success, false);
      assert.match(resBomb.body.error, /excessivement volumineuse après décompression|Taux de compression/i);
    });

    test('200 — Neutralisation des injections CSV dans les rejets (=, +, -, @, \\t, \\r) et conservation des données brutes', async () => {
      // CSV contenant des formules d'injection dans les notes et valeurs
      const csvContent = [
        'code_indicateur,code_territoire,annee,valeur,commentaires',
        'IND_INEXISTANT,CMR,2024,=cmd,+SOMME(1;1)',
        'IND_INEXISTANT,CMR,2024,@SUM(A1:A5),\t=1+1',
        'IND_INEXISTANT,CMR,2024,-1000,"=calc"'
      ].join('\n');

      const uploadRes = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', Buffer.from(csvContent, 'utf8'), 'formula_injection.csv')
        .expect(201);

      const batchId = uploadRes.body.data.batch.id;

      // Valider le mapping (toutes les lignes seront rejetées car IND_INEXISTANT est inconnu)
      await writerAgent
        .post(`/api/data/admin/imports/${batchId}/validate`)
        .set('x-csrf-token', writerCsrf)
        .send({
          mapping: {
            indicator_code: 'code_indicateur',
            territory_code: 'code_territoire',
            year: 'annee',
            value_numeric: 'valeur',
            notes: 'commentaires'
          }
        })
        .expect(200);

      // 1. Vérifier le fichier CSV des rejets
      const csvRes = await writerAgent
        .get(`/api/data/admin/imports/${batchId}/rejected.csv`)
        .expect(200);

      const rejectedText = csvRes.text;

      // Doit commencer par le BOM UTF-8 (\uFEFF)
      assert.ok(rejectedText.charCodeAt(0) === 0xFEFF, 'Le fichier CSV doit contenir le BOM UTF-8');

      // Toutes les cellules dangereuses doivent être neutralisées par une apostrophe simple
      assert.ok(rejectedText.includes('\'=cmd'), 'La formule =cmd doit être préfixée par \'');
      assert.ok(rejectedText.includes('\'+SOMME'), 'La formule +SOMME doit être préfixée par \'');
      assert.ok(rejectedText.includes('\'@SUM'), 'La formule @SUM doit être préfixée par \'');
      assert.ok(rejectedText.includes('\'=1+1'), 'La formule =1+1 doit être préfixée par \'');
      assert.ok(rejectedText.includes('\'=calc'), 'La formule =calc doit être préfixée par \'');

      // 2. Vérifier que les données brutes dans import_lines.raw_payload n'ont PAS été altérées
      const linesRes = await pool.query(
        'SELECT raw_payload FROM import_lines WHERE batch_id = $1 ORDER BY line_number ASC',
        [batchId]
      );
      assert.equal(linesRes.rows.length, 3);
      const row1 = linesRes.rows[0].raw_payload.raw_row;
      // Doit être la valeur d'origine exacte sans apostrophe injectée
      assert.equal(row1.commentaires, '+SOMME(1;1)');
    });

    test('200 — Détection des doublons en base : collision avec une observation déjà existante', async () => {
      // 1. Insérer au préalable une observation dans data_values pour l'année 2024
      const existingInsert = await pool.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, methodology_nature, editorial_status, is_active,
          revision_number, created_by
        ) VALUES (
          $1, $2, 'ANNUAL', '2024-01-01', '2024-12-31',
          125.5, 'administrative_record', 'draft', FALSE,
          1, $3
        ) RETURNING id;
      `, [testIndicatorId, testTerritoryId, writerUser.id]);
      const existingId = existingInsert.rows[0].id;

      // 2. Téléverser un fichier contenant exactement ce même tuple (même indicateur, territoire, 2024, administrative_record)
      const csvDuplicate = [
        'code_indicateur,code_territoire,annee,valeur',
        `${testIndicatorCode},${testTerritoryCode},2024,999.9`
      ].join('\n');

      const upRes = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', Buffer.from(csvDuplicate, 'utf8'), 'dup_db.csv')
        .expect(201);

      const batchId = upRes.body.data.batch.id;

      // 3. Valider le lot
      const valRes = await writerAgent
        .post(`/api/data/admin/imports/${batchId}/validate`)
        .set('x-csrf-token', writerCsrf)
        .send({
          mapping: {
            indicator_code: 'code_indicateur',
            territory_code: 'code_territoire',
            year: 'annee',
            value_numeric: 'valeur'
          },
          defaults: {
            methodology_nature: 'administrative_record'
          }
        })
        .expect(200);

      // La ligne doit être en erreur de doublon avec la base
      assert.equal(valRes.body.data.validLines, 0);
      assert.equal(valRes.body.data.errorLines, 1);
      const previewLine = valRes.body.data.preview[0];
      assert.equal(previewLine.status, 'error');
      assert.ok(previewLine.errors.some(e => e.includes('Doublon avec une observation existante en base')));
      assert.ok(previewLine.errors.some(e => e.includes(`ID #${existingId}`)));

      // 4. Tentative d'application : rejet 400 (aucune ligne valide / lot rejected)
      const applyRes = await writerAgent
        .post(`/api/data/admin/imports/${batchId}/apply`)
        .set('x-csrf-token', writerCsrf)
        .expect(400);

      assert.equal(applyRes.body.success, false);
      assert.match(applyRes.body.error, /Impossible d'appliquer un lot au statut 'rejected'|Aucune ligne valide à appliquer/i);

      // 5. Vérifier que l'observation originale en base est restée intacte (valeur 125.5, non écrasée par 999.9)
      const checkOriginal = await pool.query('SELECT value_numeric FROM data_values WHERE id = $1', [existingId]);
      assert.equal(Number(checkOriginal.rows[0].value_numeric), 125.5);
    });

    test('Protection concurrence & idempotence : deux demandes d\'application simultanées du même lot', async () => {
      // Créer un lot valide pour une année non encore utilisée (2025)
      const csvConcurrent = [
        'code_indicateur,code_territoire,annee,valeur',
        `${testIndicatorCode},${testTerritoryCode},2025,350.0`
      ].join('\n');

      const upRes = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', Buffer.from(csvConcurrent, 'utf8'), 'concurrent.csv')
        .expect(201);

      const batchId = upRes.body.data.batch.id;

      await writerAgent
        .post(`/api/data/admin/imports/${batchId}/validate`)
        .set('x-csrf-token', writerCsrf)
        .send({
          mapping: {
            indicator_code: 'code_indicateur',
            territory_code: 'code_territoire',
            year: 'annee',
            value_numeric: 'valeur'
          },
          defaults: {
            source_id: testSourceId
          }
        })
        .expect(200);

      // Déclenchement de 2 requêtes simultanées
      const [res1, res2] = await Promise.all([
        writerAgent.post(`/api/data/admin/imports/${batchId}/apply`).set('x-csrf-token', writerCsrf),
        writerAgent.post(`/api/data/admin/imports/${batchId}/apply`).set('x-csrf-token', writerCsrf)
      ]);

      const statuses = [res1.statusCode, res2.statusCode].sort();
      // L'un doit réussir (200), l'autre doit échouer (400)
      assert.deepEqual(statuses, [200, 400]);

      // Vérifier qu'exactement UNE seule observation a été créée en base
      const checkCount = await pool.query(`
        SELECT COUNT(*) AS total FROM data_values 
        WHERE indicator_id = $1 AND territory_id = $2 AND period_start = '2025-01-01'
      `, [testIndicatorId, testTerritoryId]);
      assert.equal(parseInt(checkCount.rows[0].total, 10), 1);
    });

    test('Intégrité transactionnelle : Rollback complet en cas d\'échec SQL au milieu de l\'importation', async () => {
      // Créer un lot valide
      const csvRollback = [
        'code_indicateur,code_territoire,annee,valeur',
        `${testIndicatorCode},${testTerritoryCode},2026,450.0`
      ].join('\n');

      const upRes = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', Buffer.from(csvRollback, 'utf8'), 'rollback.csv')
        .expect(201);

      const batchId = upRes.body.data.batch.id;

      await writerAgent
        .post(`/api/data/admin/imports/${batchId}/validate`)
        .set('x-csrf-token', writerCsrf)
        .send({
          mapping: {
            indicator_code: 'code_indicateur',
            territory_code: 'code_territoire',
            year: 'annee',
            value_numeric: 'valeur'
          }
        })
        .expect(200);

      // Altérer délibérément la ligne validée en base pour provoquer une violation de clé étrangère
      // (indicator_id = 9999999 inexistant) lors de l'insertion dans data_values
      await pool.query(`
        UPDATE import_lines 
        SET raw_payload = jsonb_set(raw_payload, '{indicator_id}', '9999999'::jsonb)
        WHERE batch_id = $1
      `, [batchId]);

      // L'application doit échouer
      const applyFail = await writerAgent
        .post(`/api/data/admin/imports/${batchId}/apply`)
        .set('x-csrf-token', writerCsrf)
        .expect(500);

      assert.equal(applyFail.body.success, false);

      // Vérifier le ROLLBACK :
      // 1. Aucune observation créée pour 2026
      const checkValues = await pool.query(`
        SELECT COUNT(*) AS total FROM data_values 
        WHERE indicator_id = $1 AND period_start = '2026-01-01'
      `, [testIndicatorId]);
      assert.equal(parseInt(checkValues.rows[0].total, 10), 0);

      // 2. Le lot reste au statut 'validated' (et n'a pas basculé vers 'applied')
      const checkBatch = await pool.query('SELECT status FROM import_batches WHERE id = $1', [batchId]);
      assert.equal(checkBatch.rows[0].status, 'validated');
    });
  });

  // ============================================================
  // 8. FIABILISATION DE LA PROVENANCE DOCUMENTAIRE (LOT 2D.2)
  // ============================================================
  describe('SOLITIQUO DATA — LOT 2D.2 PROVENANCE & QUALIFICATION SUITE', () => {
    test('Import sans source documentaire vérifiée : pas de fausse référence, pas de TIER 1, statut draft maintenu', async () => {
      const csvNoSource = [
        'code_indicateur,code_territoire,annee,valeur',
        `${testIndicatorCode},${testTerritoryCode},2027,510.0`
      ].join('\n');

      const upRes = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', Buffer.from(csvNoSource, 'utf8'), 'brut_non_qualifie.csv')
        .expect(201);

      const batchId = upRes.body.data.batch.id;

      // Valider sans source_id ni citation_reference
      const valRes = await writerAgent
        .post(`/api/data/admin/imports/${batchId}/validate`)
        .set('x-csrf-token', writerCsrf)
        .send({
          mapping: {
            indicator_code: 'code_indicateur',
            territory_code: 'code_territoire',
            year: 'annee',
            value_numeric: 'valeur'
          }
        })
        .expect(200);

      assert.equal(valRes.body.data.validLines, 1);
      assert.equal(valRes.body.data.preview[0].is_source_qualified, false);

      // Ingestion du lot
      const applyRes = await writerAgent
        .post(`/api/data/admin/imports/${batchId}/apply`)
        .set('x-csrf-token', writerCsrf)
        .expect(200);

      assert.equal(applyRes.body.data.importedCount, 1);

      // Vérification en base data_values
      const valCheck = await pool.query(`
        SELECT dv.id, dv.editorial_status, dv.is_active, dv.public_reason_summary, dv.internal_notes
        FROM data_values dv
        WHERE dv.indicator_id = $1 AND dv.period_start = '2027-01-01'
      `, [testIndicatorId]);

      assert.equal(valCheck.rows.length, 1);
      const obs = valCheck.rows[0];
      assert.equal(obs.editorial_status, 'draft', 'Observation strictement en brouillon');
      assert.equal(obs.is_active, false, 'Observation non active');
      assert.match(obs.public_reason_summary, /Import de données brutes/i);
      assert.match(obs.internal_notes, /Provenance fichier: brut_non_qualifie\.csv/i);
      assert.match(obs.internal_notes, /\[SOURCE NON QUALIFIÉE\]/i);

      // Vérification en base data_value_sources : AUCUNE fausse référence inventée !
      const srcCheck = await pool.query(
        'SELECT COUNT(*) AS total FROM data_value_sources WHERE data_value_id = $1',
        [obs.id]
      );
      assert.equal(parseInt(srcCheck.rows[0].total, 10), 0, 'Ne doit créer aucune source factice');
    });

    test('Import avec source institutionnelle documentée : conservation institution, référence, URL, sans TIER 1 ni high automatique', async () => {
      const csvWithSource = [
        'code_indicateur,code_territoire,annee,valeur,ref_doc,lien_doc',
        `${testIndicatorCode},${testTerritoryCode},2028,620.0,"Rapport Annuel 2028, Chapitre 3 p. 45",https://stat-cameroun.cm/rapport-2028`
      ].join('\n');

      const upRes = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', Buffer.from(csvWithSource, 'utf8'), 'document_officiel.csv')
        .expect(201);

      const batchId = upRes.body.data.batch.id;

      // Valider avec source_id et référence documentaire (sans spécifier de tier ou de robustesse)
      const valRes = await writerAgent
        .post(`/api/data/admin/imports/${batchId}/validate`)
        .set('x-csrf-token', writerCsrf)
        .send({
          mapping: {
            indicator_code: 'code_indicateur',
            territory_code: 'code_territoire',
            year: 'annee',
            value_numeric: 'valeur',
            citation_reference: 'ref_doc',
            citation_url: 'lien_doc'
          },
          defaults: {
            source_id: testSourceId
          }
        })
        .expect(200);

      assert.equal(valRes.body.data.validLines, 1);
      assert.equal(valRes.body.data.preview[0].is_source_qualified, true);

      // Ingestion
      await writerAgent
        .post(`/api/data/admin/imports/${batchId}/apply`)
        .set('x-csrf-token', writerCsrf)
        .expect(200);

      // Vérification en base data_values
      const valCheck = await pool.query(`
        SELECT dv.id, dv.editorial_status, dv.is_active, dv.internal_notes
        FROM data_values dv
        WHERE dv.indicator_id = $1 AND dv.period_start = '2028-01-01'
      `, [testIndicatorId]);

      assert.equal(valCheck.rows.length, 1);
      const obs = valCheck.rows[0];
      assert.equal(obs.editorial_status, 'draft', 'Reste strictement en brouillon');
      assert.equal(obs.is_active, false);
      assert.match(obs.internal_notes, /Provenance fichier: document_officiel\.csv/i);
      assert.match(obs.internal_notes, /Source documentaire vérifiée/i);

      // Vérification data_value_sources
      const srcCheck = await pool.query(
        'SELECT * FROM data_value_sources WHERE data_value_id = $1',
        [obs.id]
      );
      assert.equal(srcCheck.rows.length, 1);
      const srcRow = srcCheck.rows[0];

      assert.equal(srcRow.source_id, testSourceId);
      assert.equal(srcRow.citation_reference, 'Rapport Annuel 2028, Chapitre 3 p. 45');
      assert.equal(srcRow.citation_url, 'https://stat-cameroun.cm/rapport-2028');

      // ABSENCE D'ATTRIBUTION AUTOMATIQUE DE TIER 1 NI DE HIGH :
      assert.notEqual(srcRow.documentary_tier, 'TIER_1_OFFICIAL', 'TIER_1_OFFICIAL ne doit pas être attribué d\'office');
      assert.equal(srcRow.documentary_tier, 'TIER_2_STATISTICAL', 'Niveau documentaire prudent par défaut');

      assert.notEqual(srcRow.methodological_robustness, 'high', 'Robustesse "high" ne doit pas être attribuée d\'office');
      assert.equal(srcRow.methodological_robustness, 'medium', 'Robustesse prudente par défaut');
    });

    test('Attribution de TIER 1 et robustesse élevée autorisée UNIQUEMENT si explicitement qualifiée par l\'utilisateur', async () => {
      const csvExplicit = [
        'code_indicateur,code_territoire,annee,valeur,ref_doc',
        `${testIndicatorCode},${testTerritoryCode},2029,730.0,"Journal Officiel de la République, Décret n° 2029-01"`
      ].join('\n');

      const upRes = await writerAgent
        .post('/api/data/admin/imports/upload')
        .set('x-csrf-token', writerCsrf)
        .attach('file', Buffer.from(csvExplicit, 'utf8'), 'decret_officiel.csv')
        .expect(201);

      const batchId = upRes.body.data.batch.id;

      // Valider avec qualification explicite TIER 1 et high par l'utilisateur
      await writerAgent
        .post(`/api/data/admin/imports/${batchId}/validate`)
        .set('x-csrf-token', writerCsrf)
        .send({
          mapping: {
            indicator_code: 'code_indicateur',
            territory_code: 'code_territoire',
            year: 'annee',
            value_numeric: 'valeur',
            citation_reference: 'ref_doc'
          },
          defaults: {
            source_id: testSourceId,
            documentary_tier: 'TIER_1_OFFICIAL',
            methodological_robustness: 'high'
          }
        })
        .expect(200);

      await writerAgent
        .post(`/api/data/admin/imports/${batchId}/apply`)
        .set('x-csrf-token', writerCsrf)
        .expect(200);

      const obsRes = await pool.query(
        'SELECT id, editorial_status FROM data_values WHERE indicator_id = $1 AND period_start = \'2029-01-01\'',
        [testIndicatorId]
      );
      assert.equal(obsRes.rows.length, 1);
      assert.equal(obsRes.rows[0].editorial_status, 'draft', 'Toujours en brouillon');

      const srcCheck = await pool.query(
        'SELECT documentary_tier, methodological_robustness FROM data_value_sources WHERE data_value_id = $1',
        [obsRes.rows[0].id]
      );
      assert.equal(srcCheck.rows[0].documentary_tier, 'TIER_1_OFFICIAL');
      assert.equal(srcCheck.rows[0].methodological_robustness, 'high');
    });
  });
});
