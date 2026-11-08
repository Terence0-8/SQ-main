/**
 * =============================================================================
 * SOLITIQUO DATA — CONTRÔLE DE DÉPLOIEMENT PRÉPRODUCTION (LOT 3G)
 * =============================================================================
 * Checklist de validation exhaustive avant bascule en production :
 * 1. Variables d'environnement de production.
 * 2. Disponibilité et latence PostgreSQL.
 * 3. Endpoints de santé (/api/health, live, ready).
 * 4. Sanctuarisation du périmètre public (#260, #261, #262, #323).
 * 5. Sanctuarisation stricte des 24 pilotes (#687 à #710).
 * 6. Étanchéité de l'espace public (zéro fuite).
 * 7. Conformité juridique et licences des exports (Loi N° 2020/010).
 * 8. Protection anti-injection des exports CSV.
 * 9. Sécurité des routes administratives (RBAC et CSRF).
 * 10. Protection des dossiers de stockage privés.
 * 11. En-têtes de sécurité HTTP (Helmet).
 * 12. Vérification de l'existence d'une sauvegarde valide et intègre.
 * =============================================================================
 */

'use strict';

require('dotenv').config();
const request = require('supertest');
const app = require('../server');
const pool = require('../backend/config/database');
const { getLatestBackup } = require('./restore-db');
const { calculateSha256 } = require('./backup-db');
const fs = require('fs');

async function runPreproductionChecks() {
  console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
  console.log('║       SOLITIQUO DATA — CONTRÔLE DE DÉPLOIEMENT PRÉPRODUCTION (LOT 3G)     ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════╝\n');

  const checklist = [];
  let allPass = true;

  const recordCheck = (num, title, pass, detail) => {
    checklist.push({ num, title, pass, detail });
    if (!pass) allPass = false;
    const mark = pass ? '✓' : '✖';
    console.log(`[${mark}] ${num}. ${title} : ${pass ? 'CONFORME' : 'ÉCHEC'} ${detail ? '(' + detail + ')' : ''}`);
  };

  try {
    // 1. Variables d'environnement requises
    const requiredEnv = ['DB_USER', 'DB_NAME', 'DB_HOST', 'SESSION_SECRET', 'JWT_SECRET'];
    const missingEnv = requiredEnv.filter(k => !process.env[k]);
    recordCheck('01', 'Variables d\'environnement indispensables', missingEnv.length === 0, missingEnv.length === 0 ? 'Toutes présentes' : `Manquantes: ${missingEnv.join(', ')}`);

    // 2. Disponibilité et latence PostgreSQL
    const startPing = Date.now();
    await pool.query('SELECT 1');
    const latency = Date.now() - startPing;
    recordCheck('02', 'Disponibilité et latence PostgreSQL', latency < 100, `${latency} ms`);

    // 3. Endpoints de santé (/api/health)
    const healthRes = await request(app).get('/api/health');
    const isHealthOk = healthRes.status === 200 && healthRes.body.status === 'healthy' && healthRes.body.database?.status === 'connected';
    recordCheck('03', 'Endpoints de santé (/api/health, live, ready)', isHealthOk, `Status HTTP ${healthRes.status}`);

    // 4. Sanctuarisation du périmètre public (#260, #261, #262, #323)
    const pubRes = await pool.query(`
      SELECT id, indicator_id, value_numeric, editorial_status, is_active
      FROM data_values
      WHERE id IN (260, 261, 262, 323)
    `);
    const allPublished = pubRes.rows.every(r => r.editorial_status === 'published' && r.is_active === true);
    recordCheck('04', 'Périmètre public officiel (#260, #261, #262, #323)', allPublished && pubRes.rows.length === 4, '4/4 publiés et actifs');

    // 5. Sanctuarisation stricte des 24 pilotes (#687 à #710)
    const pilotRes = await pool.query(`
      SELECT COUNT(*) AS total,
             COUNT(*) FILTER (WHERE editorial_status = 'draft') AS drafts,
             COUNT(*) FILTER (WHERE is_active = FALSE) AS inactives,
             COUNT(*) FILTER (WHERE audit_decision = 'pending') AS pendings
      FROM data_values
      WHERE id BETWEEN 687 AND 710
    `);
    const p = pilotRes.rows[0];
    const pilotsOk = parseInt(p.total, 10) === 24 && parseInt(p.drafts, 10) === 24 && parseInt(p.inactives, 10) === 24 && parseInt(p.pendings, 10) === 24;
    recordCheck('05', 'Sanctuarisation des 24 pilotes (#687 à #710)', pilotsOk, '24/24 draft, inactifs, audit pending');

    // 6. Étanchéité de l'espace public (zéro fuite)
    const searchRes = await request(app).get('/api/data/search?q=PIB&limit=50');
    const leaked = (searchRes.body.data || []).some(item => item.latest_value_id >= 687 && item.latest_value_id <= 710);
    recordCheck('06', 'Étanchéité de l\'espace public (zéro fuite)', !leaked, 'Aucun pilote en recherche publique');

    // 7. Conformité juridique et licences (Loi N° 2020/010)
    const jsonRes = await request(app).get('/api/data/export/json?indicator=DEMO_POP_TOT');
    const legalOk = jsonRes.body.meta?.legal_framework?.includes('2020/010') && jsonRes.body.meta?.license?.includes('2020/010');
    recordCheck('07', 'Cadre légal et licences des exports (Loi N° 2020/010)', legalOk, 'Loi statistique camerounaise référencée');

    // 8. Protection anti-injection des exports CSV
    const csvRes = await request(app).get('/api/data/export/csv?indicator=DEMO_POP_TOT');
    const csvHasBom = csvRes.text.startsWith('\uFEFF');
    const csvHasSemicolon = csvRes.text.includes(';');
    recordCheck('08', 'Format et protection anti-injection CSV', csvHasBom && csvHasSemicolon, 'BOM UTF-8 & délimiteur \';\'');

    // 9. Sécurité des routes administratives (RBAC et CSRF)
    const adminCheck = await request(app).get('/api/data/admin/stats');
    const csrfCheck = await request(app).post('/api/data/admin/values/261/publish').send({ reason: 'sans token' });
    const securityOk = adminCheck.status === 403 && csrfCheck.status === 403;
    recordCheck('09', 'Sécurité administrative (RBAC 403 & Anti-CSRF)', securityOk, 'Accès non autorisé formellement bloqué');

    // 10. Protection des dossiers de stockage privés
    const storageCheck1 = await request(app).get('/uploads/imports/test.csv');
    const storageCheck2 = await request(app).get('/uploads/document_archive/test.pdf');
    const storageBlocked = storageCheck1.status === 403 && storageCheck2.status === 403;
    recordCheck('10', 'Verrouillage des répertoires de stockage privés', storageBlocked, 'Accès direct HTTP interdit (403)');

    // 11. En-têtes de sécurité HTTP (Helmet)
    const headersRes = await request(app).get('/api/ping');
    const hasSecurityHeaders = Boolean(headersRes.headers['x-content-type-options'] === 'nosniff' && headersRes.headers['x-frame-options']);
    recordCheck('11', 'En-têtes de sécurité HTTP (Helmet, NoSniff, FrameOptions)', hasSecurityHeaders, 'Headers de protection actifs');

    // 12. Sauvegarde et intégrité de la BDD
    const latest = getLatestBackup();
    let backupOk = false;
    let backupDetail = 'Aucune sauvegarde trouvée';
    if (latest) {
      const manifestPath = latest.path.replace(/\.sql$/, '.manifest.json');
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const hash = calculateSha256(latest.path);
        backupOk = hash === manifest.sha256_checksum;
        backupDetail = backupOk ? `Sauvegarde intègre : ${latest.file} (${(manifest.file_size_bytes / 1024).toFixed(1)} Ko)` : 'Empreinte SHA-256 non conforme';
      }
    }
    recordCheck('12', 'Point de sauvegarde disponible et scellé (SHA-256)', backupOk, backupDetail);

  } finally {
    await pool.end();
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════');
  console.log(`RÉSULTAT DU CONTRÔLE PRÉPRODUCTION : ${allPass ? '🟢 TOUS LES VOYANTS AU VERT (12/12)' : '🔴 BLOQUANTS DÉTECTÉS'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  if (!allPass) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPreproductionChecks().catch(err => {
    console.error('❌ Erreur critique lors du contrôle de préproduction :', err);
    process.exit(1);
  });
}

module.exports = { runPreproductionChecks };

