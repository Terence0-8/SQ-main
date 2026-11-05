const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const dataController = require('../controllers/dataController');

const DATA_RESOURCES = [
  {
    id: 'data-cartographie',
    title: 'Carte Interactive du Cameroun — Données Régionales & Sécurité ACLED',
    description: 'Visualisation cartographique des 10 régions du Cameroun : couches d’incidents sécuritaires (ACLED), IDH, PIB régional, démographie et repères électoraux.',
    image_url: '/data_hero_bg_1793188684198.jpg',
    category: 'Data',
    date: '2026-03-01T12:00:00.000Z',
    type: 'data',
    href: 'data-cartographie.html',
    keywords: 'carte cartographie interactive regions cameroun acled securite idh pib littoral centre adamaoua est extreme-nord nord nord-ouest ouest sud sud-ouest comparateur departement yaounde douala'
  },
  {
    id: 'data-comparateur',
    title: 'Comparateur Régional Solitiquo DATA',
    description: 'Outil d’analyse comparative côte-à-côte entre deux régions camerounaises sur les axes socio-économiques, électoraux et sécuritaires.',
    image_url: '/data_hero_bg_1793188684198.jpg',
    category: 'Data',
    date: '2026-03-01T10:00:00.000Z',
    type: 'data',
    href: 'data-cartographie.html',
    keywords: 'comparateur regional regions comparaison indicateurs territoires douala yaounde pib idh acled'
  },
  {
    id: 'data-elections',
    title: 'Archives & Résultats Électoraux (1992–2025)',
    description: 'Historique des scrutins présidentiels et législatifs camerounais, cartographie électorale départementale et analyse de participation.',
    image_url: '/data_hero_bg_1793188684198.jpg',
    category: 'Data',
    date: '2026-02-15T09:00:00.000Z',
    type: 'data',
    href: 'data.html#card-elections',
    keywords: 'elections scrutins presidentielle legislatives elecam vote suffrage politique 1992 2018 2025 participation'
  },
  {
    id: 'data-economie',
    title: 'Tableau de bord Économique Régional & PIB',
    description: 'Indicateurs macroéconomiques, PIB par région, commerce extérieur, inflation, investissements et ressources naturelles documentées.',
    image_url: '/data_hero_bg_1793188684198.jpg',
    category: 'Data',
    date: '2026-02-10T09:00:00.000Z',
    type: 'data',
    href: 'data.html#card-economie',
    keywords: 'economie pib inflation commerce finance budget ressources mine petrole douala ins croissance'
  },
  {
    id: 'data-social',
    title: 'Indicateurs Sociaux, Santé & Démographie (IDH)',
    description: 'Indice de Développement Humain (IDH), taux de scolarisation, électrification rurale, santé publique et pyramide des âges.',
    image_url: '/data_hero_bg_1793188684198.jpg',
    category: 'Data',
    date: '2026-02-01T09:00:00.000Z',
    type: 'data',
    href: 'data.html#card-social-idh',
    keywords: 'social idh demographie sante education scolarisation hopitaux population minsante ins developpement'
  },
  {
    id: 'data-sources-doc',
    title: 'Documentation Méthodologique & Corpus des Sources',
    description: 'Cadre déontologique, catalogue des indicateurs normalisés, référentiel des 61 publications auditées et métadonnées de transparence.',
    image_url: '/data_hero_bg_1793188684198.jpg',
    category: 'Data',
    date: '2026-02-01T08:00:00.000Z',
    type: 'data',
    href: 'data-sources.html',
    keywords: 'sources methodologie audit ins elecam acled banque mondiale minsante fiabilite open data'
  }
];

function normalizeText(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ── GET /api/search/data-resources : liste complète des ressources DATA ──
router.get('/data-resources', (req, res) => {
  res.json({
    success: true,
    results: DATA_RESOURCES,
    count: DATA_RESOURCES.length
  });
});

// ── GET /api/search/statistics : recherche statistique publique dédiée (Lot 3D) ──
router.get('/statistics', dataController.searchStatistics);

// ============================================================
// GET /api/search?q=motcle&type=article|podcast|emission|data|statistics&sort=date|relevance&limit=50
// Recherche ILIKE robuste sur articles + podcasts + émissions + ressources DATA + observations statistiques publiées
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { q, type, _sort = 'relevance', limit = 50, lang = 'fr' } = req.query;

    // --- Validation ---
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'La recherche doit contenir au moins 2 caractères'
      });
    }

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
    const term = q.trim();
    const ilike = `%${term}%`;
    const normalizedTerm = normalizeText(term);
    const termTokens = normalizedTerm.split(/\s+/).filter(t => t.length > 1);

    // ── Matching des ressources DATA ──────────────────────────
    let dataMatches = [];
    if (!type || type === 'data') {
      dataMatches = DATA_RESOURCES.filter(resItem => {
        const fullContent = normalizeText(`${resItem.title} ${resItem.description} ${resItem.keywords} ${resItem.category}`);
        if (fullContent.includes(normalizedTerm)) return true;
        return termTokens.length > 0 && termTokens.every(token => fullContent.includes(token));
      });
    }

    // ── Observations statistiques publiées (Lot 3D) ─────────────
    let statRows = [];
    if (!type || type === 'data' || type === 'statistics' || type === 'data_stat') {
      const statsSQL = `
        SELECT 
          dv.id,
          di.code AS indicator_code,
          di.name AS indicator_name,
          di.category AS indicator_category,
          di.unit,
          dv.value_numeric,
          dv.period_type,
          dv.period_start,
          dv.period_end,
          EXTRACT(YEAR FROM dv.period_start)::int AS period_year,
          t.code AS territory_code,
          t.name AS territory_name,
          dv.methodology_nature,
          dv.published_at AS date,
          'data_stat' AS type,
          0 AS rank
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        JOIN territories t ON t.id = dv.territory_id
        WHERE dv.editorial_status = 'published'
          AND dv.is_active = TRUE
          AND (
            di.name ILIKE $1 
            OR di.code ILIKE $1 
            OR di.description ILIKE $1
            OR di.category ILIKE $1
            OR t.name ILIKE $1
            OR t.code ILIKE $1
          )
        ORDER BY dv.published_at DESC
        LIMIT $2;
      `;
      const statRes = await pool.query(statsSQL, [ilike, safeLimit]).catch(() => ({ rows: [] }));
      statRows = statRes.rows.map(r => ({
        id: `stat-${r.id}`,
        stat_id: r.id,
        title: `${r.indicator_name} (${r.indicator_code}) — ${r.territory_name} : ${Number(r.value_numeric).toLocaleString('fr-FR')} ${r.unit}`,
        description: `Observation ${r.period_type} (${r.period_year || ''}) • Territoire : ${r.territory_name} • Méthode : ${r.methodology_nature || 'officielle'}`,
        category: 'Data',
        date: r.date,
        type: 'data_stat',
        href: `data.html#indicator-${r.indicator_code}`,
        indicator_code: r.indicator_code,
        indicator_name: r.indicator_name,
        value_numeric: Number(r.value_numeric),
        unit: r.unit,
        territory_code: r.territory_code,
        territory_name: r.territory_name,
        period_type: r.period_type,
        period_year: r.period_year,
        methodology_nature: r.methodology_nature
      }));
    }

    // ── Articles ────────────────────────────────────────────
    const articlesSQL = `
      SELECT
        id,
        title,
        excerpt        AS description,
        featured_image AS image_url,
        category,
        published_at   AS date,
        'article'      AS type,
        0              AS rank
      FROM articles
      WHERE status = 'published'
        AND language = $3
        AND (title ILIKE $1 OR excerpt ILIKE $1 OR content ILIKE $1)
      ORDER BY published_at DESC
      LIMIT $2
    `;

    // ── Podcasts ─────────────────────────────────────────────
    const podcastsSQL = `
      SELECT
        id,
        title,
        description,
        cover_image     AS image_url,
        category,
        created_at      AS date,
        'podcast'       AS type,
        0               AS rank
      FROM podcasts
      WHERE status = 'published'
        AND (title ILIKE $1 OR description ILIKE $1)
      ORDER BY created_at DESC
      LIMIT $2
    `;

    // ── Emissions ─────────────────────────────────────────────
    const emissionsSQL = `
      SELECT
        id,
        title,
        description,
        thumbnail_url AS image_url,
        category,
        created_at    AS date,
        'emission'    AS type,
        0             AS rank
      FROM emissions
      WHERE status = 'published'
        AND (title ILIKE $1 OR description ILIKE $1)
      ORDER BY created_at DESC
      LIMIT $2
    `;

    // ── Exécution en parallèle (requêtes BDD éditoriales évitées si type = data ou statistics) ──
    let artRows = [], podRows = [], emiRows = [];
    if (!type || (type !== 'data' && type !== 'statistics' && type !== 'data_stat')) {
      const [artRes, podRes, emiRes] = await Promise.all([
        (!type || type === 'article') ? pool.query(articlesSQL, [ilike, safeLimit, lang]).catch(() => ({ rows: [] })) : { rows: [] },
        (!type || type === 'podcast') ? pool.query(podcastsSQL, [ilike, safeLimit]).catch(() => ({ rows: [] })) : { rows: [] },
        (!type || type === 'emission') ? pool.query(emissionsSQL, [ilike, safeLimit]).catch(() => ({ rows: [] })) : { rows: [] }
      ]);
      artRows = artRes.rows;
      podRows = podRes.rows;
      emiRows = emiRes.rows;
    }

    let allResults = [...dataMatches, ...statRows, ...artRows, ...podRows, ...emiRows];

    // ── Filtrage par type si demandé ──────────────────────────
    if (type && ['article', 'podcast', 'emission', 'data', 'statistics', 'data_stat'].includes(type)) {
      if (type === 'data') {
        allResults = allResults.filter(r => r.type === 'data' || r.type === 'data_stat');
      } else if (type === 'statistics' || type === 'data_stat') {
        allResults = allResults.filter(r => r.type === 'data_stat');
      } else {
        allResults = allResults.filter(r => r.type === type);
      }
    }

    // ── Tri final (les résultats DATA / DATA_STAT pertinents sont valorisés en tête de tri si recherche liée aux données) ──
    allResults.sort((a, b) => {
      const aIsData = a.type === 'data' || a.type === 'data_stat';
      const bIsData = b.type === 'data' || b.type === 'data_stat';
      if (aIsData && !bIsData) return -1;
      if (bIsData && !aIsData) return 1;
      return new Date(b.date) - new Date(a.date);
    });

    res.json({
      success: true,
      results: allResults,
      count: allResults.length,
      query: term,
      mode: 'ilike+data+stats'
    });

  } catch (err) {
    console.error('❌ Erreur recherche:', err.message);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
