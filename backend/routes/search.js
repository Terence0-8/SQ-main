const express = require('express');
const router = express.Router();
const pool = require('../config/database');

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
    id: 'data-securite',
    title: 'Observatoire des Incidents Sécuritaires & Données ACLED',
    description: 'Cartographie des conflits, séries chronologiques des incidents et intensité des crises territoriales au Cameroun.',
    image_url: '/data_hero_bg_1793188684198.jpg',
    category: 'Data',
    date: '2026-01-20T09:00:00.000Z',
    type: 'data',
    href: 'data-cartographie.html',
    keywords: 'securite acled conflits crises incidents noso extreme-nord boko haram attaques armee territoire'
  },
  {
    id: 'data-sources',
    title: 'Données, Méthodologie & Sources Officielles',
    description: 'Audit et traçabilité des 5 familles d’organismes de référence : ELECAM, INS Cameroun, ACLED, Banque Mondiale, MinSANTE.',
    image_url: '/data_hero_bg_1793188684198.jpg',
    category: 'Data',
    date: '2026-01-15T09:00:00.000Z',
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

// ============================================================
// GET /api/search?q=motcle&type=article|podcast|emission|data&sort=date|relevance&limit=50
// Recherche ILIKE robuste sur articles + podcasts + émissions + ressources DATA
// ============================================================
router.get('/', async (req, res) => {
  try {
    const { q, type, sort = 'relevance', limit = 50, lang = 'fr' } = req.query;

    // --- Validation ---
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'La recherche doit contenir au moins 2 caractères'
      });
    }

    const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const term = q.trim();
    const ilike = `%${term}%`;
    const normalizedTerm = normalizeText(term);
    const termTokens = normalizedTerm.split(/\s+/).filter(t => t.length > 1);

    // ── Matching des ressources DATA ──────────────────────────
    let dataMatches = [];
    if (!type || type === 'data') {
      dataMatches = DATA_RESOURCES.filter(res => {
        const fullContent = normalizeText(`${res.title} ${res.description} ${res.keywords} ${res.category}`);
        if (fullContent.includes(normalizedTerm)) return true;
        return termTokens.length > 0 && termTokens.every(token => fullContent.includes(token));
      });
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

    // ── Exécution en parallèle (requêtes BDD évitées si type = data) ──
    let artRows = [], podRows = [], emiRows = [];
    if (!type || type !== 'data') {
      const [artRes, podRes, emiRes] = await Promise.all([
        (!type || type === 'article') ? pool.query(articlesSQL, [ilike, safeLimit, lang]).catch(() => ({ rows: [] })) : { rows: [] },
        (!type || type === 'podcast') ? pool.query(podcastsSQL, [ilike, safeLimit]).catch(() => ({ rows: [] })) : { rows: [] },
        (!type || type === 'emission') ? pool.query(emissionsSQL, [ilike, safeLimit]).catch(() => ({ rows: [] })) : { rows: [] }
      ]);
      artRows = artRes.rows;
      podRows = podRes.rows;
      emiRows = emiRes.rows;
    }

    let allResults = [...dataMatches, ...artRows, ...podRows, ...emiRows];

    // ── Filtrage par type si demandé ──────────────────────────
    if (type && ['article', 'podcast', 'emission', 'data'].includes(type)) {
      allResults = allResults.filter(r => r.type === type);
    }

    // ── Tri final (les résultats DATA pertinents sont valorisés en tête de tri si recherche liée aux données) ──
    allResults.sort((a, b) => {
      if (a.type === 'data' && b.type !== 'data') return -1;
      if (b.type === 'data' && a.type !== 'data') return 1;
      return new Date(b.date) - new Date(a.date);
    });

    res.json({
      success: true,
      results: allResults,
      count: allResults.length,
      query: term,
      mode: 'ilike+data'
    });

  } catch (err) {
    console.error('❌ Erreur recherche:', err.message);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
