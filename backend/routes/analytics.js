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
    // 1. Articles total + vues (avec COALESCE pour éviter les valeurs NULL)
    const articlesRes = await db.query(`
      SELECT 
        COUNT(*) as total_articles,
        COALESCE(SUM(views_count), 0) as total_views,
        COALESCE(AVG(views_count), 0) as avg_views_per_article
      FROM articles
      WHERE LOWER(status) = 'published' OR status IS NULL
    `);
    const articlesStats = articlesRes.rows[0];

    // 2. Utilisateurs (avec vérification souple de boolean/status)
    const usersRes = await db.query(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN is_subscriber = true THEN 1 ELSE 0 END) as total_subscribers,
        SUM(CASE WHEN is_active = true OR is_active IS NULL THEN 1 ELSE 0 END) as active_users
      FROM users
    `);
    const usersStats = usersRes.rows[0];

    // 3. Taux de conversion abonnement
    const conversionRate = (usersStats.total_users > 0)
      ? ((usersStats.total_subscribers / usersStats.total_users) * 100).toFixed(2)
      : 0;

    // 4. Contenus total
    const [podcastsRes, emissionsRes, partiesRes, pollsRes] = await Promise.all([
      db.query('SELECT COUNT(*) as total FROM podcasts'),
      db.query('SELECT COUNT(*) as total FROM emissions'),
      db.query('SELECT COUNT(*) as total FROM parties'),
      db.query('SELECT COUNT(*) as total FROM polls')
    ]);

    const podcasts = podcastsRes.rows[0];
    const emissions = emissionsRes.rows[0];
    const parties = partiesRes.rows[0];
    const polls = pollsRes.rows[0];

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
          parties: parseInt(parties.total || 0),
          polls: parseInt(polls.total || 0)
        }
      }
    });
  } catch (err) {
    console.error('❌ Erreur overview:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * GET /api/analytics/reading-progress
 * Statistiques de progression de lecture (25%, 50%, 75%, 100%)
 */
router.get('/reading-progress', isAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        COALESCE(SUM(reads_start), 0) as total_starts,
        COALESCE(SUM(views_count), 0) as total_views,
        COALESCE(SUM(reads_25), 0) as total_25,
        COALESCE(SUM(reads_50), 0) as total_50,
        COALESCE(SUM(reads_75), 0) as total_75,
        COALESCE(SUM(reads_100), 0) as total_100
      FROM articles
      WHERE LOWER(status) = 'published' OR status IS NULL
    `);
    const stats = result.rows[0];

    const totalStarts = Math.max(parseInt(stats.total_starts || 0), parseInt(stats.total_views || 0));
    const safeStarts = totalStarts > 0 ? totalStarts : 1;

    const val25 = parseInt(stats.total_25 || 0);
    const val50 = parseInt(stats.total_50 || 0);
    const val75 = parseInt(stats.total_75 || 0);
    const val100 = parseInt(stats.total_100 || 0);

    const pct25 = parseFloat(Math.min(100, (val25 / safeStarts) * 100).toFixed(1));
    const pct50 = parseFloat(Math.min(100, (val50 / safeStarts) * 100).toFixed(1));
    const pct75 = parseFloat(Math.min(100, (val75 / safeStarts) * 100).toFixed(1));
    const pct100 = parseFloat(Math.min(100, (val100 / safeStarts) * 100).toFixed(1));

    res.json({
      success: true,
      data: {
        totalStarts,
        labels: ['Début', '25% de lecture', '50% de lecture', '75% de lecture', '100% (Terminé)'],
        percentageValues: [100, pct25, pct50, pct75, pct100],
        rawValues: [totalStarts, val25, val50, val75, val100],
        rates: {
          retention_25: pct25,
          retention_50: pct50,
          retention_75: pct75,
          completion: pct100
        }
      }
    });
  } catch (err) {
    console.error('❌ Erreur reading progress:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * GET /api/analytics/top-articles
 * Top 10 des articles les plus lus
 */
router.get('/top-articles', isAdmin, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        id,
        title,
        category,
        COALESCE(views_count, 0) as views_count,
        COALESCE(reads_start, 0) as reads_start,
        COALESCE(reads_25, 0) as reads_25,
        COALESCE(reads_50, 0) as reads_50,
        COALESCE(reads_75, 0) as reads_75,
        COALESCE(reads_100, 0) as reads_100,
        created_at
      FROM articles
      WHERE LOWER(status) = 'published' OR status IS NULL
      ORDER BY views_count DESC
      LIMIT 10
    `);
    const topArticles = result.rows;

    res.json({
      success: true,
      data: topArticles.map(art => {
        const views = Math.max(parseInt(art.views_count || 0), parseInt(art.reads_start || 0));
        const r100 = parseInt(art.reads_100 || 0);
        const r75 = parseInt(art.reads_75 || 0);
        const r50 = parseInt(art.reads_50 || 0);
        const r25 = parseInt(art.reads_25 || 0);

        let rate = 0;
        if (views > 0) {
          if (r100 > 0) rate = (r100 / views) * 100;
          else if (r75 > 0) rate = (r75 / views) * 75;
          else if (r50 > 0) rate = (r50 / views) * 50;
          else if (r25 > 0) rate = (r25 / views) * 25;
        }
        rate = Math.min(100, Math.max(0, rate));

        return {
          ...art,
          views_count: views,
          reads_100: r100,
          completionRate: rate.toFixed(1)
        };
      })
    });
  } catch (err) {
    console.error('❌ Erreur top articles:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * GET /api/analytics/timeline
 * Évolution temporelle (7 derniers jours)
 */
router.get('/timeline', isAdmin, async (req, res) => {
  try {
    const articlesRes = await db.query(`
      SELECT 
        created_at::DATE as date,
        COUNT(*) as count
      FROM articles
      WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY created_at::DATE
      ORDER BY date ASC
    `);
    const articles = articlesRes.rows;

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

    // Générer les 7 derniers jours en format ISO local YYYY-MM-DD
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      last7Days.push(`${year}-${month}-${day}`);
    }

    // Helper anti-décalage de fuseau horaire
    const formatDateLocal = (val) => {
      if (!val) return '';
      if (val instanceof Date) {
        const year = val.getFullYear();
        const month = String(val.getMonth() + 1).padStart(2, '0');
        const day = String(val.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      const str = String(val);
      return str.includes('T') ? str.split('T')[0] : str.slice(0, 10);
    };

    const findCount = (dataArray, targetDateStr) => {
      const found = dataArray.find(item => formatDateLocal(item.date) === targetDateStr);
      return found ? parseInt(found.count || 0) : 0;
    };

    const articlesData = last7Days.map(date => findCount(articles, date));
    const usersData = last7Days.map(date => findCount(users, date));

    res.json({
      success: true,
      data: {
        labels: last7Days.map(d => {
          const parts = d.split('-');
          const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          return dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
        }),
        articles: articlesData,
        users: usersData
      }
    });
  } catch (err) {
    console.error('❌ Erreur timeline:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
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
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * POST /api/analytics/track
 * Enregistre un milestone de lecture (start, 25, 50, 75, 100)
 * Route publique — pas d'authentification requise
 */
router.post('/track', async (req, res) => {
  const { article_id, milestone } = req.body;

  if (!article_id || milestone === undefined) {
    return res.status(400).json({ success: false, error: 'article_id et milestone requis' });
  }

  const milestoneKey = String(milestone).trim().toLowerCase();

  const colMap = {
    'start': 'reads_start',
    '25':    'reads_25',
    '50':    'reads_50',
    '75':    'reads_75',
    '100':   'reads_100',
  };

  const col = colMap[milestoneKey];
  if (!col) {
    return res.status(400).json({ success: false, error: `Milestone invalide : ${milestone}` });
  }

  try {
    await db.query(
      `UPDATE articles SET ${col} = COALESCE(${col}, 0) + 1 WHERE id = $1`,
      [article_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erreur analytics/track:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

/**
 * POST /api/analytics/reset-views
 * Réinitialise tous les compteurs de vues et de progression de lecture à 0
 */
router.post('/reset-views', isAdmin, async (req, res) => {
  try {
    await db.query(`
      UPDATE articles 
      SET views_count = 0, 
          reads_start = 0, 
          reads_25 = 0, 
          reads_50 = 0, 
          reads_75 = 0, 
          reads_100 = 0
    `);
    res.json({
      success: true,
      message: 'Toutes les vues et données de lecture ont été réinitialisées à 0.'
    });
  } catch (err) {
    console.error('❌ Erreur reset-views:', err);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;