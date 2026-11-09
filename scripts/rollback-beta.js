'use strict';

/**
 * =============================================================================
 * SOLITIQUO — SCRIPT DE RETOUR ARRIÈRE SÉCURISÉ (ROLLBACK BÊTA)
 * =============================================================================
 * Rôle :
 * Annule sélectivement les enregistrements créés par le script `seed:beta`,
 * sans JAMAIS affecter :
 * - Les 6 partis politiques permanents du projet (RDPC, MRC, SDF, UNDP, PCRN, UDC)
 * - Les 6 candidats permanents du projet (Paul Biya, Maurice Kamto, etc.)
 * - Les données saisies ou créées manuellement après l'import
 * - Le schéma PostgreSQL et les migrations existantes
 *
 * Utilisation :
 * - Prévisualisation sans suppression : `node scripts/rollback-beta.js --dry-run`
 * - Exécution réelle contrôlée : `node scripts/rollback-beta.js --confirm`
 * =============================================================================
 */

require('dotenv').config();
const pool = require('../backend/config/database');

const PERMANENT_ACRONYMS = ['RDPC', 'MRC', 'SDF', 'UNDP', 'PCRN', 'UDC'];
const PERMANENT_PARTY_NAMES = [
  'Rassemblement Démocratique du Peuple Camerounais',
  'Mouvement pour la Renaissance du Cameroun',
  'Social Democratic Front',
  'Union Nationale pour la Démocratie et le Progrès',
  'Parti Camerounais pour la Réconciliation Nationale',
  'Union Démocratique du Cameroun'
];

const PERMANENT_CANDIDATE_NAMES = [
  'Paul Biya',
  'Maurice Kamto',
  'Joshua Osih',
  'Bello Bouba Maïgari',
  'Cabral Libii',
  'Patricia Hermine Ndam Njoya'
];

async function runRollback() {
  const isDryRun = process.argv.includes('--dry-run');
  const isConfirmed = process.argv.includes('--confirm');

  if (!isDryRun && !isConfirmed) {
    console.log('\n⚠️  ATTENTION : Sécurité d\'exécution requise.');
    console.log('   Pour prévisualiser les suppressions : node scripts/rollback-beta.js --dry-run');
    console.log('   Pour exécuter réellement le rollback : node scripts/rollback-beta.js --confirm\n');
    process.exit(0);
  }

  console.log('\n🔄 ==============================================================');
  console.log(`   SOLITIQUO : ROLLBACK DU SEED BÊTA ${isDryRun ? '(SIMULATION DRY-RUN)' : '(EXÉCUTION RÉELLE)'}`);
  console.log('   ==============================================================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Vérification de la présence de la table de log
    const logTableCheck = await client.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = '_seed_beta_log';
    `);

    if (logTableCheck.rowCount === 0) {
      console.log('ℹ️  Aucune table de journalisation `_seed_beta_log` trouvée.');
      console.log('   Le seed n\'a jamais été appliqué ou a déjà été révoqué.');
      await client.query('ROLLBACK');
      return;
    }

    // Récupération du résumé des entrées journalisées non permanentes
    const summaryRes = await client.query(`
      SELECT table_name, COUNT(*)::int as count 
      FROM _seed_beta_log 
      WHERE is_permanent = FALSE
      GROUP BY table_name;
    `);

    console.log('📋 Entrées enregistrées pour rollback (strictement exclues des permanents) :');
    summaryRes.rows.forEach(r => console.log(`   - ${r.table_name} : ${r.count} enregistrement(s)`));

    if (summaryRes.rowCount === 0) {
      console.log('\nℹ️  Aucun enregistrement éligible au rollback trouvé.');
      await client.query('ROLLBACK');
      return;
    }

    // Ordre strict de suppression respectant les clés étrangères inverses
    const deletionPlan = [
      {
        table: 'data_value_sources',
        countQuery: `
          SELECT COUNT(*)::int as cnt FROM data_value_sources
          WHERE id IN (
            SELECT record_id FROM _seed_beta_log WHERE table_name = 'data_value_sources' AND is_permanent = FALSE
          )
        `,
        execute: async (c) => {
          return await c.query(`
            DELETE FROM data_value_sources
            WHERE id IN (
              SELECT record_id FROM _seed_beta_log WHERE table_name = 'data_value_sources' AND is_permanent = FALSE
            )
          `);
        }
      },
      {
        table: 'data_value_versions',
        countQuery: `
          SELECT COUNT(*)::int as cnt FROM data_value_versions
          WHERE data_value_id IN (
            SELECT record_id FROM _seed_beta_log WHERE table_name = 'data_values' AND is_permanent = FALSE
          )
        `,
        execute: async (c) => {
          await c.query(`ALTER TABLE data_value_versions DISABLE TRIGGER trg_protect_versions_no_update_delete;`);
          try {
            return await c.query(`
              DELETE FROM data_value_versions
              WHERE data_value_id IN (
                SELECT record_id FROM _seed_beta_log WHERE table_name = 'data_values' AND is_permanent = FALSE
              );
            `);
          } finally {
            await c.query(`ALTER TABLE data_value_versions ENABLE TRIGGER trg_protect_versions_no_update_delete;`);
          }
        }
      },
      {
        table: 'data_values',
        countQuery: `
          SELECT COUNT(*)::int as cnt FROM data_values
          WHERE id IN (
            SELECT record_id FROM _seed_beta_log WHERE table_name = 'data_values' AND is_permanent = FALSE
          )
        `,
        execute: async (c) => {
          return await c.query(`
            DELETE FROM data_values
            WHERE id IN (
              SELECT record_id FROM _seed_beta_log WHERE table_name = 'data_values' AND is_permanent = FALSE
            )
          `);
        }
      },
      {
        table: 'candidates',
        countQuery: `
          SELECT COUNT(*)::int as cnt FROM candidates
          WHERE id IN (
            SELECT record_id FROM _seed_beta_log WHERE table_name = 'candidates' AND is_permanent = FALSE
          )
          AND full_name NOT IN (${PERMANENT_CANDIDATE_NAMES.map(n => `'${n.replace(/'/g, "''")}'`).join(', ')})
        `,
        execute: async (c) => {
          return await c.query(`
            DELETE FROM candidates
            WHERE id IN (
              SELECT record_id FROM _seed_beta_log WHERE table_name = 'candidates' AND is_permanent = FALSE
            )
            AND full_name NOT IN (${PERMANENT_CANDIDATE_NAMES.map(n => `'${n.replace(/'/g, "''")}'`).join(', ')})
          `);
        }
      },
      {
        table: 'parties',
        countQuery: `
          SELECT COUNT(*)::int as cnt FROM parties
          WHERE id IN (
            SELECT record_id FROM _seed_beta_log WHERE table_name = 'parties' AND is_permanent = FALSE
          )
          AND acronym NOT IN (${PERMANENT_ACRONYMS.map(a => `'${a}'`).join(', ')})
          AND name NOT IN (${PERMANENT_PARTY_NAMES.map(n => `'${n.replace(/'/g, "''")}'`).join(', ')})
        `,
        execute: async (c) => {
          return await c.query(`
            DELETE FROM parties
            WHERE id IN (
              SELECT record_id FROM _seed_beta_log WHERE table_name = 'parties' AND is_permanent = FALSE
            )
            AND acronym NOT IN (${PERMANENT_ACRONYMS.map(a => `'${a}'`).join(', ')})
            AND name NOT IN (${PERMANENT_PARTY_NAMES.map(n => `'${n.replace(/'/g, "''")}'`).join(', ')})
          `);
        }
      },
      {
        table: 'polls',
        countQuery: `
          SELECT COUNT(*)::int as cnt FROM polls
          WHERE id IN (
            SELECT record_id FROM _seed_beta_log WHERE table_name = 'polls' AND is_permanent = FALSE
          )
        `,
        execute: async (c) => {
          return await c.query(`
            DELETE FROM polls
            WHERE id IN (
              SELECT record_id FROM _seed_beta_log WHERE table_name = 'polls' AND is_permanent = FALSE
            )
          `);
        }
      },
      {
        table: 'articles',
        countQuery: `
          SELECT COUNT(*)::int as cnt FROM articles
          WHERE id IN (
            SELECT record_id FROM _seed_beta_log WHERE table_name = 'articles' AND is_permanent = FALSE
          )
        `,
        execute: async (c) => {
          return await c.query(`
            DELETE FROM articles
            WHERE id IN (
              SELECT record_id FROM _seed_beta_log WHERE table_name = 'articles' AND is_permanent = FALSE
            )
          `);
        }
      },
      {
        table: 'podcasts',
        countQuery: `
          SELECT COUNT(*)::int as cnt FROM podcasts
          WHERE id IN (
            SELECT record_id FROM _seed_beta_log WHERE table_name = 'podcasts' AND is_permanent = FALSE
          )
        `,
        execute: async (c) => {
          return await c.query(`
            DELETE FROM podcasts
            WHERE id IN (
              SELECT record_id FROM _seed_beta_log WHERE table_name = 'podcasts' AND is_permanent = FALSE
            )
          `);
        }
      },
      {
        table: 'emissions',
        countQuery: `
          SELECT COUNT(*)::int as cnt FROM emissions
          WHERE id IN (
            SELECT record_id FROM _seed_beta_log WHERE table_name = 'emissions' AND is_permanent = FALSE
          )
        `,
        execute: async (c) => {
          return await c.query(`
            DELETE FROM emissions
            WHERE id IN (
              SELECT record_id FROM _seed_beta_log WHERE table_name = 'emissions' AND is_permanent = FALSE
            )
          `);
        }
      },
      {
        table: 'users',
        countQuery: `
          SELECT COUNT(*)::int as cnt FROM users
          WHERE id IN (
            SELECT record_id FROM _seed_beta_log WHERE table_name = 'users' AND is_permanent = FALSE
          )
          AND email = 'redaction@solitiquo.com'
          AND NOT EXISTS (SELECT 1 FROM articles WHERE author_id = users.id)
          AND NOT EXISTS (SELECT 1 FROM podcasts WHERE author_id = users.id)
          AND NOT EXISTS (SELECT 1 FROM data_value_audit_log WHERE performed_by = users.id)
        `,
        execute: async (c) => {
          return await c.query(`
            DELETE FROM users
            WHERE id IN (
              SELECT record_id FROM _seed_beta_log WHERE table_name = 'users' AND is_permanent = FALSE
            )
            AND email = 'redaction@solitiquo.com'
            AND NOT EXISTS (SELECT 1 FROM articles WHERE author_id = users.id)
            AND NOT EXISTS (SELECT 1 FROM podcasts WHERE author_id = users.id)
            AND NOT EXISTS (SELECT 1 FROM data_value_audit_log WHERE performed_by = users.id)
          `);
        }
      }
    ];

    console.log('\n⚙️  Exécution du plan de suppression contrôlé...');
    let totalDeleted = 0;

    for (const step of deletionPlan) {
      if (isDryRun) {
        const countRes = await client.query(step.countQuery);
        console.log(`   [DRY-RUN] ${step.table} : ${countRes.rows[0].cnt} ligne(s) seraient supprimée(s).`);
        totalDeleted += countRes.rows[0].cnt;
      } else {
        const delRes = await step.execute(client);
        console.log(`   ✓ ${step.table} : ${delRes.rowCount} ligne(s) supprimée(s).`);
        totalDeleted += delRes.rowCount;
      }
    }

    // Nettoyage des logs
    if (!isDryRun) {
      await client.query(`DELETE FROM _seed_beta_log WHERE is_permanent = FALSE;`);
      console.log('   ✓ Nettoyage de `_seed_beta_log` effectué.');
      await client.query('COMMIT');
      console.log(`\n🎉 Rollback achevé avec succès (${totalDeleted} enregistrements révoqués, données permanentes préservées).`);
    } else {
      await client.query('ROLLBACK');
      console.log(`\n🔍 Simulation achevée : ${totalDeleted} enregistrements seraient révoqués. Aucune modification effectuée.`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERREUR DURANT LE ROLLBACK (TRANSACTION INTÉGRALEMENT ANNULÉE) :', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runRollback().catch(() => process.exit(1));
