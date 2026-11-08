/**
 * =============================================================================
 * SOLITIQUO DATA — TESTS DE PRÉPARATION À LA PRODUCTION (LOT 3G)
 * =============================================================================
 * Validation automatisée des prérequis opérationnels :
 * 1. Sondes de santé enrichies (/api/health, /api/health/live, /api/health/ready).
 * 2. Stratégie de sauvegarde scellée par SHA-256 et manifeste d'intégrité.
 * 3. Procédure de restauration testée en mode simulation (--dry-run).
 * 4. Harmonisation des métadonnées juridiques et licences (Loi N° 2020/010).
 * 5. Distinction fine des natures statistiques dans les exports.
 * 6. Protection hermétique des répertoires de stockage privés (403 Forbidden).
 * 7. Sanctuarisation inconditionnelle de #261 et des 24 observations pilotes.
 * =============================================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');
const pool = require('../backend/config/database');
const { performBackup, calculateSha256 } = require('../scripts/backup-db');
const { performRestore, getLatestBackup } = require('../scripts/restore-db');

describe('SOLITIQUO DATA — LOT 3G : PRÉPARATION À LA MISE EN PRODUCTION', () => {

  // ===========================================================================
  // SECTION 1 : SONDES DE SANTÉ ET DISPONIBILITÉ POSTGRESQL
  // ===========================================================================
  describe('1. Sondes de Santé et Disponibilité Système', () => {

    test('GET /api/health retourne un statut healthy avec métriques de latence et mémoire', async () => {
      const res = await request(app).get('/api/health').expect(200);

      assert.equal(res.body.status, 'healthy');
      assert.equal(res.body.database?.status, 'connected');
      assert.ok(typeof res.body.database?.latency_ms === 'number');
      assert.ok(typeof res.body.uptime_seconds === 'number');
      assert.ok(res.body.memory?.rss_mb > 0);
      assert.ok(res.body.memory?.heap_used_mb > 0);
    });

    test('GET /api/health/live et GET /api/health/ready valident le cycle de vie applicatif', async () => {
      const liveRes = await request(app).get('/api/health/live').expect(200);
      assert.equal(liveRes.body.status, 'live');

      const readyRes = await request(app).get('/api/health/ready').expect(200);
      assert.equal(readyRes.body.status, 'ready');
      assert.equal(readyRes.body.database, 'connected');
    });
  });

  // ===========================================================================
  // SECTION 2 : STRATÉGIE DE SAUVEGARDE ET DE RESTAURATION
  // ===========================================================================
  describe('2. Sauvegardes, Manifestes et Procédure de Restauration', () => {

    test('La sauvegarde génère un fichier SQL non vide et un manifeste scellé par SHA-256', async () => {
      const manifest = await performBackup('test_preprod_backup');

      assert.ok(manifest.backup_file);
      assert.ok(fs.existsSync(manifest.file_path));
      assert.ok(manifest.file_size_bytes > 1000000, 'Taille supérieure à 1 Mo');
      assert.equal(manifest.integrity_status, 'VERIFIED');
      assert.ok(manifest.sha256_checksum && manifest.sha256_checksum.length === 64);
      assert.ok(manifest.database_stats.data_values_total > 0);
      assert.equal(manifest.database_stats.pilot_draft_observations, 24);

      // Vérification physique du fichier sur disque
      const computedHash = calculateSha256(manifest.file_path);
      assert.equal(computedHash, manifest.sha256_checksum, 'L\'empreinte calculée doit correspondre au manifeste');
    });

    test('La procédure de restauration en simulation (--dry-run) valide l\'intégrité sans altération', async () => {
      const latest = getLatestBackup();
      assert.ok(latest, 'Au moins un point de sauvegarde disponible');

      const restoreResult = await performRestore({
        backupFile: latest.path,
        dryRun: true
      });

      assert.equal(restoreResult.success, true);
      assert.equal(restoreResult.dryRun, true);
    });
  });

  // ===========================================================================
  // SECTION 3 : LICENCES JURIDIQUES ET QUALIFICATION DES NATURES STATISTIQUES
  // ===========================================================================
  describe('3. Métadonnées Juridiques, Licences et Natures Statistiques', () => {

    test('L\'export JSON intègre le cadre légal camerounais (Loi N° 2020/010) et la classification détaillée', async () => {
      const res = await request(app)
        .get('/api/data/export/json?indicator=DEMO_POP_TOT')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.ok(res.body.meta.legal_framework.includes('Loi N° 2020/010'));
      assert.ok(res.body.meta.license.includes('Loi N° 2020/010'));
      assert.ok(res.body.meta.reuse_terms.includes('source officielle primaire'));

      const records = res.body.data;
      assert.ok(records.length > 0);
      for (const r of records) {
        assert.ok(r.statistical_nature, 'Objet statistical_nature présent');
        assert.ok(r.statistical_nature.code, 'Code nature statistique présent');
        assert.ok(r.statistical_nature.label, 'Libellé nature statistique présent');
      }
    });

    test('L\'export JSON-LD Schema.org intègre les mentions légales et licences d\'usage', async () => {
      const res = await request(app)
        .get('/api/data/export/json-ld?indicator=DEMO_POP_TOT')
        .expect(200);

      assert.equal(res.body['@type'], 'DataFeed');
      assert.ok(res.body.license);
      assert.ok(res.body.usageInfo.includes('2020/010'));
      assert.ok(Array.isArray(res.body.dataFeedElement));
      assert.ok(res.body.dataFeedElement[0].disambiguatingDescription, 'Mention de la nature statistique');
    });

    test('L\'export CSV intègre les libellés de chiffrage détaillés (définitif, projection, estimation)', async () => {
      const res = await request(app)
        .get('/api/data/export/csv?indicator=DEMO_POP_TOT')
        .expect(200);

      assert.ok(res.text.startsWith('\uFEFF'), 'BOM UTF-8 présent');
      assert.ok(res.text.includes('Statut Chiffrage'), 'Colonne Statut Chiffrage présente');
      assert.ok(res.text.includes('Projection') || res.text.includes('Donnée définitive'));
    });
  });

  // ===========================================================================
  // SECTION 4 : SÉCURITÉ DE STOCKAGE ET SANCTUARISATION
  // ===========================================================================
  describe('4. Sécurité du Stockage et Sanctuarisation des Données', () => {

    test('L\'accès direct HTTP aux dossiers privés (/uploads/imports, /uploads/document_archive, /backend/storage) est strictement interdit (403)', async () => {
      await request(app).get('/uploads/imports/batch.csv').expect(403);
      await request(app).get('/uploads/document_archive/evidence.pdf').expect(403);
      await request(app).get('/backend/storage/secrets.json').expect(403);
    });

    test('Sanctuarisation totale : 4 observations publiées officielles (#260, #261, #262, #323) et 24 pilotes intacts', async () => {
      const pubRes = await pool.query(`
        SELECT id, value_numeric, editorial_status, is_active
        FROM data_values
        WHERE id IN (260, 261, 262, 323)
      `);
      assert.equal(pubRes.rows.length, 4);
      assert.ok(pubRes.rows.every(r => r.editorial_status === 'published' && r.is_active === true));

      const obs261 = pubRes.rows.find(r => parseInt(r.id, 10) === 261);
      assert.equal(Number(obs261.value_numeric), 29850, 'Observation #261 intacte à 29 850 Mrds FCFA');

      const pilotRes = await pool.query(`
        SELECT COUNT(*) AS total
        FROM data_values
        WHERE id BETWEEN 687 AND 710
          AND editorial_status = 'draft'
          AND is_active = FALSE
          AND audit_decision = 'pending'
      `);
      assert.equal(parseInt(pilotRes.rows[0].total, 10), 24, '24/24 pilotes en confinement strict');
    });
  });
});

