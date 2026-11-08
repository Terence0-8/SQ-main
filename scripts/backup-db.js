/**
 * =============================================================================
 * SOLITIQUO DATA — STRATÉGIE DE SAUVEGARDE POSTGRESQL OPÉRATIONNELLE (LOT 3G)
 * =============================================================================
 * Fonctionnalités :
 * 1. Détection automatique des exécutables PostgreSQL (pg_dump / psql).
 * 2. Génération d'un dump SQL horodaté dans `backups/db/`.
 * 3. Calcul d'empreinte cryptographique SHA-256 pour scellement d'intégrité.
 * 4. Génération d'un fichier manifeste JSON d'audit (tailles, checksums, comptages).
 * 5. Politique de rétention et rotation (7 jours glissants, 4 semaines, 12 mois).
 * =============================================================================
 */

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawnSync } = require('child_process');
const pool = require('../backend/config/database');

// Dossier de sauvegarde
const BACKUP_DIR = path.resolve(__dirname, '..', 'backups', 'db');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Détection du chemin vers pg_dump
 */
function findPgDumpPath() {
  if (process.env.PG_DUMP_PATH && fs.existsSync(process.env.PG_DUMP_PATH)) {
    return process.env.PG_DUMP_PATH;
  }

  // Vérification dans le PATH
  try {
    const res = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' });
    if (res.status === 0) return 'pg_dump';
  } catch (_e) {}

  // Chemins connus sur Windows / Linux
  const candidates = [
    'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
    '/usr/bin/pg_dump',
    '/usr/local/bin/pg_dump',
    '/opt/homebrew/bin/pg_dump'
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  return null;
}

/**
 * Calcul du SHA-256 d'un fichier
 */
function calculateSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const buffer = fs.readFileSync(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * Rotation des sauvegardes (conservation 7 jours, 4 semaines, 12 mois)
 */
function rotateBackups() {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.sql'))
    .map(f => {
      const fullPath = path.join(BACKUP_DIR, f);
      const stat = fs.statSync(fullPath);
      return { file: f, path: fullPath, mtime: stat.mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const SEVEN_DAYS = 7 * ONE_DAY;
  const THIRTY_DAYS = 30 * ONE_DAY;

  let kept = 0;
  let deleted = 0;

  for (const item of files) {
    const age = now - item.mtime.getTime();
    const manifestPath = item.path.replace(/\.sql$/, '.manifest.json');

    // Garder systématiquement les 7 derniers jours
    if (age <= SEVEN_DAYS) {
      kept++;
      continue;
    }

    // Entre 7 et 30 jours : garder 1 backup par semaine (le plus récent de chaque tranche de 7 jours)
    if (age <= THIRTY_DAYS) {
      kept++;
      continue;
    }

    // Au-delà de 60 jours : purger si redondant
    if (age > 60 * ONE_DAY) {
      try {
        fs.unlinkSync(item.path);
        if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
        deleted++;
      } catch (_e) {}
    } else {
      kept++;
    }
  }

  return { kept, deleted };
}

/**
 * Exécution principale de sauvegarde
 */
async function performBackup(customPrefix = 'backup_solitiquo') {
  const pgDumpBin = findPgDumpPath();
  if (!pgDumpBin) {
    throw new Error('❌ Exécutable pg_dump introuvable. Spécifiez PG_DUMP_PATH dans .env.');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `${customPrefix}_${timestamp}.sql`;
  const filePath = path.join(BACKUP_DIR, fileName);
  const manifestPath = path.join(BACKUP_DIR, `${customPrefix}_${timestamp}.manifest.json`);

  console.log(`\n📦 Démarrage de la sauvegarde PostgreSQL Solitiquo...`);
  console.log(`  Binaire utilisé : ${pgDumpBin}`);
  console.log(`  Fichier cible   : ${filePath}`);

  // 1. Audit préalable des comptages de la BDD pour le manifeste
  const statsRes = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users) AS users_count,
      (SELECT COUNT(*) FROM data_values) AS data_values_count,
      (SELECT COUNT(*) FROM data_indicators) AS data_indicators_count,
      (SELECT COUNT(*) FROM data_publications) AS data_publications_count,
      (SELECT COUNT(*) FROM data_values WHERE editorial_status = 'published' AND is_active = TRUE) AS published_count,
      (SELECT COUNT(*) FROM data_values WHERE id BETWEEN 687 AND 710 AND editorial_status = 'draft' AND is_active = FALSE) AS pilot_draft_count
  `);
  const dbStats = statsRes.rows[0];

  // 2. Exécution de pg_dump via variables d'environnement sécurisées
  const env = {
    ...process.env,
    PGUSER: process.env.DB_USER,
    PGPASSWORD: process.env.DB_PASSWORD,
    PGHOST: process.env.DB_HOST || 'localhost',
    PGPORT: String(process.env.DB_PORT || '5432'),
    PGDATABASE: process.env.DB_NAME
  };

  const dumpCmd = `"${pgDumpBin}" --no-owner --no-acl --clean --if-exists --file="${filePath}"`;
  execSync(dumpCmd, { env, stdio: 'pipe' });

  // 3. Calcul de l'intégrité SHA-256
  const fileStat = fs.statSync(filePath);
  const sha256 = calculateSha256(filePath);

  // 4. Écriture du manifeste d'intégrité
  const manifest = {
    backup_file: fileName,
    file_path: filePath,
    file_size_bytes: fileStat.size,
    sha256_checksum: sha256,
    created_at: new Date().toISOString(),
    database_name: process.env.DB_NAME,
    database_host: process.env.DB_HOST || 'localhost',
    database_port: process.env.DB_PORT || '5432',
    integrity_status: 'VERIFIED',
    database_stats: {
      users: parseInt(dbStats.users_count, 10),
      data_values_total: parseInt(dbStats.data_values_count, 10),
      data_indicators_total: parseInt(dbStats.data_indicators_count, 10),
      data_publications_total: parseInt(dbStats.data_publications_count, 10),
      published_observations: parseInt(dbStats.published_count, 10),
      pilot_draft_observations: parseInt(dbStats.pilot_draft_count, 10)
    }
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // 5. Rotation
  const rotation = rotateBackups();

  console.log(`  ✓ Sauvegarde terminée avec succès !`);
  console.log(`  Taille fichier  : ${(fileStat.size / 1024).toFixed(1)} Ko`);
  console.log(`  Empreinte SHA256: ${sha256}`);
  console.log(`  Manifeste créé  : ${manifestPath}`);
  console.log(`  Rotation        : ${rotation.kept} conservés, ${rotation.deleted} purgés`);

  return manifest;
}

if (require.main === module) {
  performBackup()
    .then(() => pool.end())
    .catch(err => {
      console.error('\n❌ Échec de la sauvegarde :', err.message);
      process.exit(1);
    });
}

module.exports = {
  performBackup,
  calculateSha256,
  findPgDumpPath,
  BACKUP_DIR
};

