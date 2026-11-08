/**
 * =============================================================================
 * SOLITIQUO DATA — SAUVEGARDE PRÉALABLE AVANT MIGRATION (LOT 3G)
 * =============================================================================
 * Règle impérative : Ne jamais exécuter de migration sans sauvegarde préalable.
 * =============================================================================
 */

'use strict';

const { performBackup } = require('./backup-db');
const pool = require('../backend/config/database');

async function runPreMigrationBackup() {
  console.log('🛡️  Vérification de sécurité pré-déploiement / pré-migration...');
  const manifest = await performBackup('pre_migration_backup');
  console.log(`✅ Point de reprise créé : ${manifest.backup_file}`);
  return manifest;
}

if (require.main === module) {
  runPreMigrationBackup()
    .then(() => pool.end())
    .catch(err => {
      console.error('❌ Échec critique de la sauvegarde pré-migration :', err.message);
      process.exit(1);
    });
}

module.exports = { runPreMigrationBackup };

