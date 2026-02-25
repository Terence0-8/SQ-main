/**
 * Script de migration : calcul du read_time pour tous les articles existants
 * -------------------------------------------------------------------
 * À lancer UNE SEULE FOIS depuis le serveur :
 *   node backend/migrations/run_read_time_migration.js
 * -------------------------------------------------------------------
 * Ce script :
 *   1. Ajoute la colonne `read_time` si elle n'existe pas
 *   2. Calcule et met à jour le read_time de TOUS les articles existants
 *   3. Affiche un rapport (total, min, max, moyenne)
 */

require('dotenv').config();
const pool = require('../config/database');

// Vitesse de lecture adulte moyenne (mots/minute)
// 200 wpm = prudent | 230 wpm = standard presse | 250 wpm = rapide
const WORDS_PER_MINUTE = 230;

/**
 * Calcule le temps de lecture d'un texte brut (HTML stripped)
 * @param {string} content - Contenu HTML de l'article
 * @returns {number} Temps en minutes (minimum 1)
 */
function calcReadTime(content) {
  if (!content || content.trim() === '') return 1;
  // Strip les balises HTML pour ne compter que les mots réels
  const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = plainText.split(' ').filter(w => w.length > 0).length;
  return Math.max(Math.ceil(wordCount / WORDS_PER_MINUTE), 1);
}

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 Démarrage migration read_time...');
    await client.query('BEGIN');

    // --- ÉTAPE 1 : Ajout de la colonne si elle n'existe pas ---
    await client.query(`
      ALTER TABLE articles
        ADD COLUMN IF NOT EXISTS read_time INTEGER NOT NULL DEFAULT 1
    `);
    console.log('✅ Colonne read_time ajoutée (ou déjà présente)');

    // --- ÉTAPE 2 : Récupérer tous les articles avec leur contenu ---
    const { rows: articles } = await client.query(
      'SELECT id, content FROM articles WHERE content IS NOT NULL'
    );
    console.log(`📰 ${articles.length} article(s) trouvé(s) à mettre à jour...`);

    // --- ÉTAPE 3 : Calcul et mise à jour en JS (strip HTML propre) ---
    let updated = 0;
    let stats = { min: Infinity, max: 0, total: 0 };

    for (const article of articles) {
      const readTime = calcReadTime(article.content);
      await client.query(
        'UPDATE articles SET read_time = $1 WHERE id = $2',
        [readTime, article.id]
      );
      stats.min = Math.min(stats.min, readTime);
      stats.max = Math.max(stats.max, readTime);
      stats.total += readTime;
      updated++;

      // Log de progression tous les 10 articles
      if (updated % 10 === 0) {
        console.log(`  ... ${updated}/${articles.length} traités`);
      }
    }

    await client.query('COMMIT');

    // --- RAPPORT FINAL ---
    const avg = articles.length > 0 ? (stats.total / articles.length).toFixed(1) : 0;
    console.log('\n📊 Rapport de migration :');
    console.log(`   Articles mis à jour : ${updated}`);
    console.log(`   Temps min           : ${stats.min === Infinity ? 0 : stats.min} min`);
    console.log(`   Temps max           : ${stats.max} min`);
    console.log(`   Temps moyen         : ${avg} min`);
    console.log('\n🎉 Migration terminée avec succès !');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Erreur migration, rollback effectué :', err.message);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

runMigration();
