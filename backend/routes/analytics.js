const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { isAdmin } = require('../middleware/auth');

// ╔═══════════════════════════════════════════════════════╗
// ║  ANALYTICS DASHBOARD ROUTES - PREMIUM EDITION (2026-01-23)  ║
// ╚═══════════════════════════════════════════════════════╝

/**
 * GET /api/admin/analytics/overview
 * Statistiques globales de la plateforme
 */
router.get('/overview', isAdmin, async (req, res) => {
  try {
    // 1. Articles total + vues
    const articlesStats = await db.get(`
      SELECT 
        COUNT(*) as total_articles,
        SUM(views_count) as total_views,
        AVG(views_count) as avg_views_per_article
      FROM articles
      WHERE status = 'published'
    `);

    // 2. Utilisateurs
    const usersStats = await db.get(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN is_subscriber = 1 THEN 1 ELSE 0 END) as total_subscribers,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users
      FROM users
    `);

    // 3. Taux de conversion abonnement
    const conversionRate = usersStats.total_users > 0 
      ? ((usersStats.total_subscribers / usersStats.total_users) * 100).toFixed(2)
      : 0;

    // 4. Contenus total
    const [podcasts, emissions, parties] = await Promise.all([
      db.get('SELECT COUNT(*) as total FROM podcasts'),
      db.get('SELECT COUNT(*) as total FROM emissions'),
      db.get('SELECT COUNT(*) as total FROM parties')
    ]);

    res.json({
      success: true,
      data: {
        articles: {
          total: articlesStats.total_articles || 0,
          totalViews: articlesStats.total_views || 0,
          avgViews: Math.round(articlesStats.avg_views_per_article || 0)
        },
        users: {
          total: usersStats.total_users || 0,
          subscribers: usersStats.total_subscribers || 0,
          active: usersStats.active_users || 0,
          conversionRate: parseFloat(conversionRate)
        },
        content: {
          podcasts: podcasts.total || 0,
          emissions: emissions.total || 0,
          parties: parties.total || 0
        }
      }
    });
  } catch (err) {
    console.error('❌ Erreur overview:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/admin/analytics/reading-progress
 * Statistiques de progression de lecture (25%, 50%, 75%, 100%)
 */
router.get('/reading-progress', isAdmin, async (req, res) => {
  try {
    const stats = await db.get(`
      SELECT 
        SUM(reads_start) as total_starts,
        SUM(reads_25) as total_25,
        SUM(reads_50) as total_50,
        SUM(reads_75) as total_75,
        SUM(reads_100) as total_100
      FROM articles
      WHERE status = 'published'
    `);

    // Calcul des taux d'abandon
    const totalStarts = stats.total_starts || 1; // Éviter division par 0
    
    res.json({
      success: true,
      data: {
        labels: ['Début', '25%', '50%', '75%', '100%'],
        values: [
          stats.total_starts || 0,
          stats.total_25 || 0,
          stats.total_50 || 0,
          stats.total_75 || 0,
          stats.total_100 || 0
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
 * GET /api/admin/analytics/top-articles
 * Top 10 des articles les plus lus
 */
router.get('/top-articles', isAdmin, async (req, res) => {
  try {
    const topArticles = await db.all(`
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
 * GET /api/admin/analytics/timeline
 * Évolution temporelle (7 derniers jours)
 */
router.get('/timeline', isAdmin, async (req, res) => {
  try {
    // Articles publiés sur les 7 derniers jours
    const articles = await db.all(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM articles
      WHERE created_at >= DATE('now', '-7 days')
      AND status = 'published'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Nouveaux utilisateurs sur les 7 derniers jours
    const users = await db.all(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= DATE('now', '-7 days')
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Générer les 7 derniers jours (même si aucune donnée)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      last7Days.push(date.toISOString().split('T')[0]);
    }

    // Mapper les données
    const articlesData = last7Days.map(date => {
      const found = articles.find(a => a.date === date);
      return found ? found.count : 0;
    });

    const usersData = last7Days.map(date => {
      const found = users.find(u => u.date === date);
      return found ? found.count : 0;
    });

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
 * GET /api/admin/analytics/categories
 * Répartition des articles par catégorie
 */
router.get('/categories', isAdmin, async (req, res) => {
  try {
    const categories = await db.all(`
      SELECT 
        category,
        COUNT(*) as count,
        SUM(views_count) as total_views
      FROM articles
      WHERE status = 'published'
      GROUP BY category
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      data: {
        labels: categories.map(c => c.category),
        counts: categories.map(c => c.count),
        views: categories.map(c => c.total_views || 0)
      }
    });
  } catch (err) {
    console.error('❌ Erreur categories:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;