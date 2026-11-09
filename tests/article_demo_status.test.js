'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const pool = require('../backend/config/database');
const fs = require('fs');
const path = require('path');

describe('Mode Démonstration Éditoriale (Articles)', () => {
  let testArticleId;
  const testSlug = 'test-demo-status-article-' + Date.now();

  before(async () => {
    // Insérer un article de test avec is_demo = true
    const res = await pool.query(`
      INSERT INTO articles (
        title, slug, content, excerpt, category, status, is_demo, language
      )
      VALUES ($1, $2, $3, $4, $5, 'published', TRUE, 'fr')
      RETURNING id;
    `, [
      'Article de Test Démonstration Fictif',
      testSlug,
      'Contenu de test pour la validation du mode démonstration éditoriale sur Solitiquo.',
      'Extrait de démonstration...',
      'Politique'
    ]);
    testArticleId = res.rows[0].id;
  });

  after(async () => {
    if (testArticleId) {
      await pool.query('DELETE FROM articles WHERE id = $1', [testArticleId]);
    }
    await pool.end();
  });

  it('1. La colonne is_demo existe et est requêtée sur la table articles', async () => {
    const colRes = await pool.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'articles' AND column_name = 'is_demo';
    `);
    assert.strictEqual(colRes.rows.length, 1);
    assert.strictEqual(colRes.rows[0].data_type, 'boolean');
  });

  it('2. L\'article inséré possède bien is_demo = true', async () => {
    const res = await pool.query('SELECT is_demo FROM articles WHERE id = $1', [testArticleId]);
    assert.strictEqual(res.rows[0].is_demo, true);
  });

  it('3. Un article créé sans is_demo prend la valeur par défaut FALSE', async () => {
    const manualSlug = 'test-manual-non-demo-' + Date.now();
    const res = await pool.query(`
      INSERT INTO articles (title, slug, content, category, status, language)
      VALUES ('Article Manuel Non Demo', $1, 'Contenu authentique de test sans flag demo.', 'Social', 'published', 'fr')
      RETURNING id, is_demo;
    `, [manualSlug]);

    try {
      assert.strictEqual(res.rows[0].is_demo, false);
    } finally {
      await pool.query('DELETE FROM articles WHERE id = $1', [res.rows[0].id]);
    }
  });

  it('4. Les 80 articles du seed sont tous configurés avec is_demo: true', () => {
    const seedPath = path.join(__dirname, '../backend/data/seeds/articles.json');
    const articles = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    assert.strictEqual(articles.length, 80);
    const demoArticles = articles.filter(a => a.is_demo === true);
    assert.strictEqual(demoArticles.length, 80, 'Tous les 80 articles doivent avoir is_demo = true');
  });

  it('5. La page article.html contient la bannière explicite d\'avertissement', () => {
    const articleHtml = fs.readFileSync(path.join(__dirname, '../article.html'), 'utf8');
    assert.ok(articleHtml.includes('art-demo-banner'), 'Doit contenir le conteneur art-demo-banner');
    assert.ok(articleHtml.includes('art-demo-text'), 'Doit contenir le texte d\'avertissement');
    assert.ok(articleHtml.includes('Contenu de démonstration — informations fictives, ne pas considérer comme une actualité vérifiée.'), 'Doit contenir le texte français');
    assert.ok(articleHtml.includes('Demo content — fictional information, not verified news.'), 'Doit contenir la traduction anglaise');
  });

  it('6. Les gabarits d\'affichage cartes intègrent les badges DÉMO / DEMO', () => {
    const i18nJs = fs.readFileSync(path.join(__dirname, '../js/i18n.js'), 'utf8');
    assert.ok(i18nJs.includes('badge-demo'), 'js/i18n.js doit afficher la classe badge-demo');
    assert.ok(i18nJs.includes('DÉMONSTRATION'), 'js/i18n.js doit afficher DÉMONSTRATION');

    const adminHtml = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
    assert.ok(adminHtml.includes('demoBadge'), 'admin.html doit afficher le badge démo');
    assert.ok(adminHtml.includes('DÉMO'), 'admin.html doit afficher DÉMO');
  });
});
