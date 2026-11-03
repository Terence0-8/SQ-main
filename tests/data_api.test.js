'use strict';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-only';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 2A API FUNCTIONAL TEST SUITE', () => {
  const suffix = Date.now().toString().slice(-6);
  let userId;
  let territoryId;
  let indicatorId;
  let inactiveIndicatorId;
  let sourceId;
  let dimId;
  let itemId;
  let publishedValId;
  let draftValId;
  let revokedValId;

  const indCode = `IND_API_${suffix}`;
  const inactiveIndCode = `IND_INACT_${suffix}`;
  const dimCode = `DIM_API_${suffix}`;
  const itemCode = `ITEM_API_${suffix}`;
  const secretNote = `CONFIDENTIAL_NOTE_${suffix}`;

  before(async () => {
    // 1. Utilisateur test
    const uRes = await pool.query(
      "INSERT INTO users (username, email, password, role) VALUES ($1, $2, 'secret', 'admin') RETURNING id",
      [`api_admin_${suffix}`, `api_admin_${suffix}@solitiquo.cm`]
    );
    userId = uRes.rows[0].id;

    // 2. Territoire Cameroun (issu du seed)
    const terRes = await pool.query("SELECT id FROM territories WHERE code = 'CMR'");
    territoryId = terRes.rows[0].id;

    // 3. Indicateurs (actif et inactif)
    const indRes = await pool.query(
      "INSERT INTO data_indicators (code, name, category, unit, is_active, description) VALUES ($1, 'Indicateur Test API', 'economie', 'percentage', TRUE, 'Desc publique') RETURNING id",
      [indCode]
    );
    indicatorId = indRes.rows[0].id;

    const inactRes = await pool.query(
      "INSERT INTO data_indicators (code, name, category, unit, is_active, description) VALUES ($1, 'Indicateur Inactif API', 'economie', 'units', FALSE, 'Desc inactif') RETURNING id",
      [inactiveIndCode]
    );
    inactiveIndicatorId = inactRes.rows[0].id;

    // 4. Source documentaire
    const srcRes = await pool.query(
      "INSERT INTO data_sources (name, acronym, institution_type, website_url) VALUES ($1, $2, 'national_statistical_office', 'https://stat.cm') RETURNING id",
      [`Source API ${suffix}`, `SRC_${suffix}`]
    );
    sourceId = srcRes.rows[0].id;

    // 5. Dimension et Catégorie de ventilation
    const dimRes = await pool.query(
      "INSERT INTO breakdown_dimensions (code, label, dimension_type) VALUES ($1, 'Dimension Test API', 'demographics') RETURNING id",
      [dimCode]
    );
    dimId = dimRes.rows[0].id;

    const itemRes = await pool.query(
      "INSERT INTO breakdown_items (dimension_id, code, label) VALUES ($1, $2, 'Item Test API') RETURNING id",
      [dimId, itemCode]
    );
    itemId = itemRes.rows[0].id;

    // 6. Valeur 1 : Créée en draft puis attachée et publiée
    const pubRes = await pool.query(`
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, methodology_nature, editorial_status, is_active,
        created_by, internal_notes, public_reason_summary, methodology_notes
      ) VALUES (
        $1, $2, 'ANNUAL', '2024-01-01', '2024-12-31',
        42.50, 'sample_survey', 'draft', FALSE,
        $3, $4, 'Publication officielle 2024', 'Méthode d''échantillonnage représentatif'
      ) RETURNING id
    `, [indicatorId, territoryId, userId, secretNote]);
    publishedValId = pubRes.rows[0].id;

    // Rattachement source primaire obligatoire
    await pool.query(`
      INSERT INTO data_value_sources (
        data_value_id, source_id, source_role, documentary_tier,
        citation_reference, citation_url, methodological_robustness, notes, created_by
      ) VALUES (
        $1, $2, 'primary', 'TIER_1_OFFICIAL',
        'Rapport Annuel Statistique 2024 p.12', 'https://stat.cm/rapport-2024.pdf', 'high', 'Source officielle certifiée', $3
      )
    `, [publishedValId, sourceId, userId]);

    // Rattachement ventilation
    await pool.query(`
      INSERT INTO data_value_breakdowns (
        data_value_id, breakdown_item_id, value_numeric, percentage, rank
      ) VALUES (
        $1, $2, 21.00, 49.410, 1
      )
    `, [publishedValId, itemId]);

    // Bascule en statut publié
    await pool.query(`
      UPDATE data_values 
      SET editorial_status = 'published', is_active = TRUE, published_at = NOW(), published_by = $2
      WHERE id = $1
    `, [publishedValId, userId]);

    // 7. Valeur 2 : BROUILLON (draft, ne doit JAMAIS être exposée)
    const draftRes = await pool.query(`
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, methodology_nature, editorial_status, is_active,
        created_by, internal_notes
      ) VALUES (
        $1, $2, 'ANNUAL', '2023-01-01', '2023-12-31',
        999.99, 'census', 'draft', FALSE,
        $3, $4
      ) RETURNING id
    `, [indicatorId, territoryId, userId, `DRAFT_${secretNote}`]);
    draftValId = draftRes.rows[0].id;

    // 8. Valeur 3 : RÉVOQUÉE (revoked, is_active=FALSE, ne doit JAMAIS être exposée)
    const revRes = await pool.query(`
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, methodology_nature, editorial_status, is_active,
        created_by, internal_notes
      ) VALUES (
        $1, $2, 'ANNUAL', '2022-01-01', '2022-12-31',
        888.88, 'administrative_record', 'revoked', FALSE,
        $3, $4
      ) RETURNING id
    `, [indicatorId, territoryId, userId, `REVOKED_${secretNote}`]);
    revokedValId = revRes.rows[0].id;
  });

  after(async () => {
    try {
      // Nettoyage au mieux (les tables audit/versions empêchent la suppression directe de data_values sans désactivation de trigger,
      // mais on peut nettoyer les référentiels de test ou simplement fermer)
      await pool.query("UPDATE data_indicators SET is_active = FALSE WHERE id IN ($1, $2)", [indicatorId, inactiveIndicatorId]);
    } catch {
      // Nettoyage non bloquant
    }
  });

  // =========================================================================
  // 1. GET /api/data/territories
  // =========================================================================
  describe('GET /api/data/territories', () => {
    test('200 — retourne la liste des territoires avec CMR et régions', async () => {
      const res = await request(app).get('/api/data/territories');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));
      assert.ok(res.body.data.length >= 11, 'Doit contenir au moins CMR et ses 10 régions');

      const cmr = res.body.data.find(t => t.code === 'CMR');
      assert.ok(cmr, 'Le Cameroun doit être présent');
      assert.equal(cmr.type, 'country');
      assert.ok(cmr.name);
    });

    test('200 — filtre par type (type=region)', async () => {
      const res = await request(app).get('/api/data/territories?type=region');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.every(t => t.type === 'region'));
      assert.ok(res.body.data.length >= 10);
    });

    test('200 — filtre par parent_code (parent_code=CMR)', async () => {
      const res = await request(app).get('/api/data/territories?parent_code=CMR');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.every(t => t.parent_code === 'CMR'));
    });
  });

  // =========================================================================
  // 2. GET /api/data/indicators
  // =========================================================================
  describe('GET /api/data/indicators', () => {
    test('200 — retourne les indicateurs actifs et exclut les inactifs', async () => {
      const res = await request(app).get('/api/data/indicators');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));

      const activeFound = res.body.data.some(i => i.code === indCode);
      const inactiveFound = res.body.data.some(i => i.code === inactiveIndCode);
      assert.equal(activeFound, true, 'L indicateur actif doit être présent');
      assert.equal(inactiveFound, false, 'L indicateur inactif doit être exclu');
    });

    test('200 — filtre par category', async () => {
      const res = await request(app).get('/api/data/indicators?category=economie');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.every(i => i.category === 'economie'));
      assert.ok(res.body.data.some(i => i.code === indCode));
    });
  });

  // =========================================================================
  // 3. GET /api/data/sources
  // =========================================================================
  describe('GET /api/data/sources', () => {
    test('200 — retourne les sources documentaires', async () => {
      const res = await request(app).get('/api/data/sources');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data));

      const found = res.body.data.find(s => s.id === sourceId);
      assert.ok(found, 'La source de test doit être présente');
      assert.equal(found.institution_type, 'national_statistical_office');
      assert.equal(found.website_url, 'https://stat.cm');
    });

    test('200 — filtre par institution_type', async () => {
      const res = await request(app).get('/api/data/sources?institution_type=national_statistical_office');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.every(s => s.institution_type === 'national_statistical_office'));
    });
  });

  // =========================================================================
  // 4. GET /api/data/indicators/:code/values
  // =========================================================================
  describe('GET /api/data/indicators/:code/values', () => {
    test('200 — retourne les observations publiées et actives avec ventilations et sources', async () => {
      const res = await request(app).get(`/api/data/indicators/${indCode}/values`);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.meta, 'Métadonnées présentes');
      assert.equal(res.body.meta.indicator.code, indCode);
      assert.equal(res.body.meta.total, 1);

      const obs = res.body.data[0];
      assert.equal(obs.id, publishedValId);
      assert.equal(Number(obs.value_numeric), 42.5);
      assert.equal(obs.methodology_nature, 'sample_survey');
      assert.equal(obs.public_reason_summary, 'Publication officielle 2024');

      // Vérification des sources agrégées
      assert.ok(Array.isArray(obs.sources));
      assert.equal(obs.sources.length, 1);
      assert.equal(obs.sources[0].source_id, sourceId);
      assert.equal(obs.sources[0].citation_reference, 'Rapport Annuel Statistique 2024 p.12');
      assert.equal(obs.sources[0].methodological_robustness, 'high');

      // Vérification des ventilations agrégées
      assert.ok(Array.isArray(obs.breakdowns));
      assert.equal(obs.breakdowns.length, 1);
      assert.equal(obs.breakdowns[0].item_code, itemCode);
      assert.equal(Number(obs.breakdowns[0].value_numeric), 21.0);
      assert.equal(Number(obs.breakdowns[0].percentage), 49.41);
    });

    test('Exclusion absolue : ni brouillon (draft) ni valeur révoquée ne sont renvoyés', async () => {
      const res = await request(app).get(`/api/data/indicators/${indCode}/values`);
      assert.equal(res.status, 200);
      const ids = res.body.data.map(v => v.id);
      assert.ok(!ids.includes(draftValId), 'Le brouillon ne doit jamais être présent');
      assert.ok(!ids.includes(revokedValId), 'L observation révoquée ne doit jamais être présente');
    });

    test('Sécurité et confidentialité : notes internes et administrateurs ne sont pas divulgués', async () => {
      const res = await request(app).get(`/api/data/indicators/${indCode}/values`);
      assert.equal(res.status, 200);
      const jsonStr = JSON.stringify(res.body);

      assert.ok(!jsonStr.includes(secretNote), 'La note interne ne doit jamais fuiter');
      assert.ok(!jsonStr.includes('internal_notes'), 'La clé internal_notes ne doit pas être exposée');
      assert.ok(!jsonStr.includes('created_by'), 'La clé created_by ne doit pas être exposée');
      assert.ok(!jsonStr.includes('validated_by'), 'La clé validated_by ne doit pas être exposée');
      assert.ok(!jsonStr.includes('published_by'), 'La clé published_by ne doit pas être exposée');
    });

    test('200 — filtres : territory_code, year, methodology_nature', async () => {
      const res = await request(app).get(`/api/data/indicators/${indCode}/values?territory_code=CMR&year=2024&methodology_nature=sample_survey`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1);

      // Filtre année ne correspondant pas
      const resEmpty = await request(app).get(`/api/data/indicators/${indCode}/values?year=2020`);
      assert.equal(resEmpty.status, 200);
      assert.equal(resEmpty.body.data.length, 0);
    });

    test('200 — pagination standardisée (limit=1, page=1)', async () => {
      const res = await request(app).get(`/api/data/indicators/${indCode}/values?page=1&limit=1`);
      assert.equal(res.status, 200);
      assert.equal(res.body.meta.page, 1);
      assert.equal(res.body.meta.limit, 1);
      assert.equal(res.body.meta.total, 1);
      assert.equal(res.body.meta.total_pages, 1);
    });

    test('404 — indicateur inactif non exposé', async () => {
      const res = await request(app).get(`/api/data/indicators/${inactiveIndCode}/values`);
      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
    });

    test('404 — indicateur introuvable', async () => {
      const res = await request(app).get('/api/data/indicators/UNKNOWN_IND/values');
      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
    });

    test('400 — code indicateur avec caractères invalides', async () => {
      const res = await request(app).get('/api/data/indicators/BAD*CODE!/values');
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    test('400 — paramètre year invalide', async () => {
      const res = await request(app).get(`/api/data/indicators/${indCode}/values?year=notanumber`);
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });
  });

  // =========================================================================
  // 5. GET /api/data/territories/:code/values
  // =========================================================================
  describe('GET /api/data/territories/:code/values', () => {
    test('200 — retourne les observations publiées pour le territoire avec filtres', async () => {
      const res = await request(app).get(`/api/data/territories/CMR/values?indicator_code=${indCode}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.meta.territory.code, 'CMR');
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].id, publishedValId);
    });

    test('404 — territoire introuvable', async () => {
      const res = await request(app).get('/api/data/territories/UNKNOWN_TER/values');
      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
    });

    test('400 — format de code territoire invalide', async () => {
      const res = await request(app).get('/api/data/territories/C%20MR$/values');
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });
  });

  // =========================================================================
  // 6. GET /api/data/values/:id
  // =========================================================================
  describe('GET /api/data/values/:id', () => {
    test('200 — retourne le détail complet d une observation publiée', async () => {
      const res = await request(app).get(`/api/data/values/${publishedValId}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const val = res.body.data;
      assert.equal(val.id, publishedValId);
      assert.equal(val.indicator_code, indCode);
      assert.equal(val.territory_code, 'CMR');
      assert.equal(Number(val.value_numeric), 42.5);
      assert.equal(val.methodology_nature, 'sample_survey');
      assert.ok(val.published_at);
      assert.equal(val.sources.length, 1);
      assert.equal(val.breakdowns.length, 1);

      // Vérifier confidentialité
      const jsonStr = JSON.stringify(res.body);
      assert.ok(!jsonStr.includes(secretNote));
      assert.ok(!jsonStr.includes('internal_notes'));
      assert.ok(!jsonStr.includes('created_by'));
      assert.ok(!jsonStr.includes('validated_by'));
    });

    test('404 — observation en brouillon (draft) protégée', async () => {
      const res = await request(app).get(`/api/data/values/${draftValId}`);
      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
    });

    test('404 — observation révoquée protégée', async () => {
      const res = await request(app).get(`/api/data/values/${revokedValId}`);
      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
    });

    test('404 — observation inexistante', async () => {
      const res = await request(app).get('/api/data/values/99999999');
      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
    });

    test('400 — identifiant invalide (non-numérique)', async () => {
      const res = await request(app).get('/api/data/values/invalid-id');
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });

    test('400 — identifiant négatif ou zéro', async () => {
      const res = await request(app).get('/api/data/values/-5');
      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
    });
  });

  // =========================================================================
  // 7. NON-RÉGRESSION DES ROUTES EXISTANTES
  // =========================================================================
  describe('Non-régression des routes existantes', () => {
    test('GET /api/subscriptions/pricing fonctionne toujours (200)', async () => {
      const res = await request(app).get('/api/subscriptions/pricing');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
    });
  });
});
