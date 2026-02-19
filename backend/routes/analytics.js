const express = require('express');
const router = express.Router();
const db = require('../config/database'); // pool pg
const { isAdmin } = require('../middleware/auth');

// ╔═══════════════════════════════════════════════════════╗
// ║  ANALYTICS DASHBOARD ROUTES - PREMIUM EDITION (POSTGRESQL FIX)  ║
// ╚═══════════════════════════════════════════════════════╝

/**
 * GET /api/analytics/overview
 * Statistiques globales de la plateforme
 */
router.get('/overview', isAdmin, async (req, res) => {
  try {
    // 1. Articles total + vues
    // Utilisation de db.query() au lieu de db.get()
    const articlesRes = await db.query(`
      SELECT 
        COUNT(*) as total_articles,
        SUM(views_count) as total_views,
        AVG(views_count) as avg_views_per_article
      FROM articles
      WHERE status = 'published'
    `);
    const articlesStats = articlesRes.rows[0];

    // 2. Utilisateurs
    // CASE WHEN is_subscriber = true (ou 1) fonctionne en PG si boolean
    const usersRes = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN is_subscriber = true THEN 1 ELSE 0 END) as total_subscribers,
        SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END) as active_users
      FROM users
    `);
    const usersStats = usersRes.rows[0];

    // 3. Taux de conversion abonnement
    const conversionRate = (usersStats.total_users > 0)
      ? ((usersStats.total_subscribers / usersStats.total_users) * 100).toFixed(2)
      : 0;

    // 4. Contenus total
    const [podcastsRes, emissionsRes, partiesRes] = await Promise.all([
      db.query('SELECT COUNT(*) as total FROM podcasts'),
      db.query('SELECT COUNT(*) as total FROM emissions'),
      db.query('SELECT COUNT(*) as total FROM parties')
    ]);

    const podcasts = podcastsRes.rows[0];
    const emissions = emissionsRes.rows[0];
    const parties = partiesRes.rows[0];

    res.json({
      success: true,
      data: {
        articles: {
          total: parseInt(articlesStats.total_articles || 0),
          totalViews: parseInt(articlesStats.total_views || 0),
          avgViews: Math.round(articlesStats.avg_views_per_article || 0)
        },
        users: {
          total: parseInt(usersStats.total_users || 0),
          subscribers: parseInt(usersStats.total_subscribers || 0),
          active: parseInt(usersStats.active_users || 0),
          conversionRate: parseFloat(conversionRate)
        },
        content: {
          podcasts: parseInt(podcasts.total || 0),
          emissions: parseInt(emissions.total || 0),
          parties: parseInt(parties.total || 0)
        }
      }
    });
  } catch (err) {
    console.error('❌ Erreur overview:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/reading-progress
 * Statistiques de progression de lecture (25%, 50%, 75%, 100%)
 */
router.get('/reading-progress', isAdmin, async (req, res) => {
  try {
    // Déjà compatible (db.query utilisé)
    const result = await db.query(`
      SELECT 
        SUM(reads_start) as total_starts,
        SUM(reads_25) as total_25,
        SUM(reads_50) as total_50,
        SUM(reads_75) as total_75,
        SUM(reads_100) as total_100
      FROM articles
      WHERE status = 'published'
    `);
    const stats = result.rows[0];

    // Calcul des taux d'abandon
    const totalStarts = parseInt(stats.total_starts || 0) || 1; // Éviter division par 0

    res.json({
      success: true,
      data: {
        labels: ['Début', '25%', '50%', '75%', '100%'],
        values: [
          parseInt(stats.total_starts || 0),
          parseInt(stats.total_25 || 0),
          parseInt(stats.total_50 || 0),
          parseInt(stats.total_75 || 0),
          parseInt(stats.total_100 || 0)
        ],
        rates: {
          retention_25: ((stats.total_25 / totalStarts) * 100).toFixed(1),
          retention_50: ((stats.total_50 / totalStarts) * 100).toFixed(1),
          retention_75: ((stats.total_75 / totalStarts) * 100).toFixed(1),
          completion: ((stats.total_100 / totalStarts) * 100).toFixed(1)
        }
      }
    });
  } catch (err) {
    console.error('❌ Erreur reading progress:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/top-articles
 * Top 10 des articles les plus lus
 */
router.get('/top-articles', isAdmin, async (req, res) => {
  try {
    // db.all -> db.query
    const result = await db.query(`
      SELECT 
        id,
        title,
        category,
        views_count,
        reads_100,
        created_at
      FROM articles
      WHERE status = 'published'
      ORDER BY views_count DESC
      LIMIT 10
    `);
    const topArticles = result.rows;

    res.json({
      success: true,
      data: topArticles.map(art => ({
        ...art,
        completionRate: art.views_count > 0
          ? ((art.reads_100 / art.views_count) * 100).toFixed(1)
          : 0
      }))
    });
  } catch (err) {
    console.error('❌ Erreur top articles:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/timeline
 * Évolution temporelle (7 derniers jours)
 */
router.get('/timeline', isAdmin, async (req, res) => {
  try {
    // Articles publiés sur les 7 derniers jours
    // SQLite: DATE('now', '-7 days') -> PG: CURRENT_DATE - INTERVAL '7 days'
    // SQLite: DATE(created_at) -> PG: created_at::DATE
    const articlesRes = await db.query(`
      SELECT 
        created_at::DATE as date,
        COUNT(*) as count
      FROM articles
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      AND status = 'published'
      GROUP BY created_at::DATE
      ORDER BY date ASC
    `);
    const articles = articlesRes.rows;

    // Nouveaux utilisateurs sur les 7 derniers jours
    const usersRes = await db.query(`
      SELECT 
        created_at::DATE as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY created_at::DATE
      ORDER BY date ASC
    `);
    const users = usersRes.rows;

    // Générer les 7 derniers jours
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      last7Days.push(date.toISOString().split('T')[0]); // YYYY-MM-DD
    }

    // Mapper les données
    // Attention: PG node renvoie des objets Date pour les colonnes date

    // Fonction helper pour comparer les dates
    const findCount = (dataArray, targetDateStr) => {
      const found = dataArray.find(item => {
        let d = item.date;
        // Convertir en string YYYY-MM-DD si c'est un objet Date
        if (d instanceof Date) {
          d = d.toISOString().split('T')[0];
        }
        // Si c'est déjà une string (certains drivers ou config)
        if (typeof d === 'string' && d.includes('T')) {
          d = d.split('T')[0];
        }
        return d === targetDateStr;
      });
      return found ? parseInt(found.count || 0) : 0;
    };

    const articlesData = last7Days.map(date => findCount(articles, date));
    const usersData = last7Days.map(date => findCount(users, date));

    res.json({
      success: true,
      data: {
        labels: last7Days.map(d => {
          const date = new Date(d);
          return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        }),
        articles: articlesData,
        users: usersData
      }
    });
  } catch (err) {
    console.error('❌ Erreur timeline:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/analytics/categories
 * Répartition des articles par catégorie
 */
router.get('/categories', isAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        category,
        COUNT(*) as count,
        SUM(views_count) as total_views
      FROM articles
      WHERE status = 'published'
      GROUP BY category
      ORDER BY count DESC
    `);
    const categories = result.rows;

    res.json({
      success: true,
      data: {
        labels: categories.map(c => c.category),
        counts: categories.map(c => parseInt(c.count || 0)),
        views: categories.map(c => parseInt(c.total_views || 0))
      }
    });
  } catch (err) {
    console.error('❌ Erreur categories:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;