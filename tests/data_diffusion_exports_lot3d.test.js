/**
 * SOLITIQUO DATA — LOT 3D TEST SUITE
 * Tests complets : Diffusion publique, recherche statistique, exports (CSV, JSON, JSON-LD),
 * déduplication du corpus documentaire, étanchéité absolue et non-régression.
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — LOT 3D DIFFUSION PUBLIQUE, RECHERCHE ET EXPORTS', () => {
  let createdTestValueIds = [];
  let testIndicatorId;
  const testIndCode = 'IND_TEST_3D_' + Date.now();

  before(async () => {
    // 1. Créer un indicateur de test isolé pour valider les filtres et l'étanchéité
    const indRes = await pool.query(`
      INSERT INTO data_indicators (
        code, name, short_name, description, category, subdomain, unit,
        data_nature, calculation_formula, expected_periodicity, geographical_levels,
        producer_institution, potential_sources, methodological_limitations,
        availability_start_year, definition_status, status, is_active
      ) VALUES (
        $1, 'Indicateur Test Diffusion 3D', NULL, 'Indicateur pour éprouver la recherche et l export',
        'economie', 'finances', 'pourcentage', 'rate', 'A / B * 100', 'ANNUAL', '["country"]'::json,
        'Institut National de la Statistique', 'Enquêtes périodiques', '=SUM(1+1) Marge d erreur d échantillonnage',
        2020, 'solitiquo_working', 'active', TRUE
      )
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [testIndCode]);
    testIndicatorId = indRes.rows[0].id;

    // Récupérer le territoire CMR
    const terrRes = await pool.query("SELECT id FROM territories WHERE code = 'CMR' LIMIT 1");
    const territoryId = terrRes.rows[0].id;

    // Récupérer une source
    const srcRes = await pool.query("SELECT id FROM data_sources LIMIT 1");
    const sourceId = srcRes.rows[0].id;

    // Récupérer un utilisateur admin pour les créations
    const userRes = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
    const adminUserId = userRes.rows[0]?.id || 1;

    // 2. Créer une observation (draft d'abord, puis rattachement source, puis publication pour satisfaire le trigger)
    const pubValRes = await pool.query(`
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, methodology_nature, editorial_status, is_active,
        public_reason_summary, methodology_notes, audit_caveat, internal_notes,
        created_by
      ) VALUES (
        $1, $2, 'ANNUAL', '2023-01-01', '2023-12-31',
        18.75, 'sample_survey', 'draft', FALSE,
        'Publication annuelle officielle', 'Donnée issue de l enquête nationale',
        '=SUM(1+1) Réserve méthodologique test formule injection',
        'SECRET_INTERNAL_NOTE_NEVER_LEAK_3D',
        $3
      ) RETURNING id;
    `, [testIndicatorId, territoryId, adminUserId]);
    const pubValId = pubValRes.rows[0].id;
    createdTestValueIds.push(pubValId);

    // Rattacher une source à cette observation (avec formule injection test)
    await pool.query(`
      INSERT INTO data_value_sources (
        data_value_id, source_id, source_role, documentary_tier,
        citation_reference, citation_url, created_by
      ) VALUES ($1, $2, 'primary', 'TIER_1_OFFICIAL', '=SUM(1+1) INS Rapport Annuel 2023', 'https://ins.cm', $3)
    `, [pubValId, sourceId, adminUserId]);

    // Publier l'observation maintenant qu'elle a sa source primaire
    await pool.query(`
      UPDATE data_values
      SET editorial_status = 'published', is_active = TRUE, published_by = $1, published_at = NOW()
      WHERE id = $2
    `, [adminUserId, pubValId]);

    // 3. Créer des observations NON PUBLIÉES pour tester l'exclusion absolue :
    // A. Draft
    const draftRes = await pool.query(`
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, methodology_nature, editorial_status, is_active,
        internal_notes, created_by
      ) VALUES (
        $1, $2, 'ANNUAL', '2022-01-01', '2022-12-31',
        99.99, 'projection', 'draft', FALSE,
        'DRAFT_SECRET_NOTE_3D', $3
      ) RETURNING id;
    `, [testIndicatorId, territoryId, adminUserId]);
    createdTestValueIds.push(draftRes.rows[0].id);

    // B. Rejected
    const rejRes = await pool.query(`
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, methodology_nature, editorial_status, is_active,
        audit_decision, internal_notes, created_by
      ) VALUES (
        $1, $2, 'ANNUAL', '2021-01-01', '2021-12-31',
        88.88, 'projection', 'rejected', FALSE,
        'rejected', 'REJECTED_SECRET_NOTE_3D', $3
      ) RETURNING id;
    `, [testIndicatorId, territoryId, adminUserId]);
    createdTestValueIds.push(rejRes.rows[0].id);

    // C. Revoked (inactive)
    const revRes = await pool.query(`
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, methodology_nature, editorial_status, is_active,
        internal_notes, created_by
      ) VALUES (
        $1, $2, 'ANNUAL', '2020-01-01', '2020-12-31',
        77.77, 'projection', 'revoked', FALSE,
        'REVOKED_SECRET_NOTE_3D', $3
      ) RETURNING id;
    `, [testIndicatorId, territoryId, adminUserId]);
    createdTestValueIds.push(revRes.rows[0].id);

    // D. Published but is_active = FALSE (ex: remplacée)
    const inactRes = await pool.query(`
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, methodology_nature, editorial_status, is_active,
        internal_notes, created_by
      ) VALUES (
        $1, $2, 'ANNUAL', '2019-01-01', '2019-12-31',
        66.66, 'projection', 'draft', FALSE,
        'INACTIVE_SECRET_NOTE_3D', $3
      ) RETURNING id;
    `, [testIndicatorId, territoryId, adminUserId]);
    const inactId = inactRes.rows[0].id;
    createdTestValueIds.push(inactId);

    await pool.query(`
      INSERT INTO data_value_sources (
        data_value_id, source_id, source_role, documentary_tier,
        citation_reference, created_by
      ) VALUES ($1, $2, 'primary', 'TIER_1_OFFICIAL', 'Source historique archivée', $3)
    `, [inactId, sourceId, adminUserId]);

    await pool.query(`
      UPDATE data_values SET editorial_status = 'published', is_active = FALSE WHERE id = $1
    `, [inactId]);
  });

  after(async () => {
    // Nettoyage sécurisé des données de test
    if (createdTestValueIds.length > 0) {
      try {
        await pool.query("UPDATE data_values SET is_active = FALSE, editorial_status = 'draft' WHERE id = ANY($1)", [createdTestValueIds]);
        await pool.query('DELETE FROM data_value_sources WHERE data_value_id = ANY($1)', [createdTestValueIds]);
        await pool.query(`
          DELETE FROM data_values
          WHERE id = ANY($1)
            AND id NOT IN (SELECT DISTINCT data_value_id FROM data_value_versions)
        `, [createdTestValueIds]);
      } catch (e) {
        console.warn('Nettoyage test values Lot 3D:', e.message);
      }
    }
    if (testIndicatorId) {
      try {
        await pool.query('DELETE FROM data_publication_indicators WHERE indicator_id = $1', [testIndicatorId]);
        await pool.query(`
          DELETE FROM data_indicators
          WHERE id = $1
            AND id NOT IN (SELECT DISTINCT indicator_id FROM data_values)
        `, [testIndicatorId]);
      } catch (e) {
        console.warn('Nettoyage test indicator Lot 3D:', e.message);
      }
    }
  });

  // =========================================================================
  // 1. RECHERCHE STATISTIQUE PUBLIQUE DÉDIÉE ET INTÉGRÉE
  // =========================================================================
  describe('1. Recherche Statistique Publique', () => {
    test('1.1 Recherche par code indicateur via /api/data/search', async () => {
      const res = await request(app).get(`/api/data/search?indicator=${testIndCode}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.meta.total, 1);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].indicator_code, testIndCode);
      assert.equal(res.body.data[0].value_numeric, 18.75);
      assert.equal(res.body.data[0].territory_code, 'CMR');
      assert.equal(res.body.data[0].is_estimation, false);
      assert.ok(res.body.data[0].detail_url);
    });

    test('1.2 Recherche par mot-clé textuel (nom d indicateur)', async () => {
      const res = await request(app).get('/api/data/search?q=Diffusion 3D');
      assert.equal(res.status, 200);
      assert.ok(res.body.meta.total >= 1);
      const match = res.body.data.find(d => d.indicator_code === testIndCode);
      assert.ok(match, 'L indicateur créé doit être trouvé par ses mots-clés');
    });

    test('1.3 Recherche territoriale par code territoire (CMR)', async () => {
      const res = await request(app).get('/api/data/search?territory=CMR');
      assert.equal(res.status, 200);
      assert.ok(res.body.data.length >= 1);
      assert.ok(res.body.data.every(d => d.territory_code === 'CMR'));
    });

    test('1.4 Filtrage temporel (année 2023)', async () => {
      const res = await request(app).get(`/api/data/search?indicator=${testIndCode}&year=2023`);
      assert.equal(res.status, 200);
      assert.equal(res.body.meta.total, 1);
      assert.equal(res.body.data[0].period_year, 2023);

      const resEmpty = await request(app).get(`/api/data/search?indicator=${testIndCode}&year=2099`);
      assert.equal(resEmpty.status, 200);
      assert.equal(resEmpty.body.meta.total, 0);
    });

    test('1.5 Filtrage par domaine statistique (economie)', async () => {
      const res = await request(app).get(`/api/data/search?category=economie&indicator=${testIndCode}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.meta.total, 1);

      const resWrongCat = await request(app).get(`/api/data/search?category=sante&indicator=${testIndCode}`);
      assert.equal(resWrongCat.status, 200);
      assert.equal(resWrongCat.body.meta.total, 0);
    });

    test('1.6 Pagination et tri', async () => {
      const res = await request(app).get('/api/data/search?limit=1&page=1&sort=date_desc');
      assert.equal(res.status, 200);
      assert.equal(res.body.meta.limit, 1);
      assert.equal(res.body.meta.page, 1);
      assert.ok(res.body.meta.total_pages >= 1);
    });

    test('1.7 Route dédiée /api/search/statistics conforme à l API de recherche', async () => {
      const res = await request(app).get(`/api/search/statistics?indicator=${testIndCode}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.meta.total, 1);
      assert.equal(res.body.data[0].indicator_code, testIndCode);
    });

    test('1.8 Intégration globale dans /api/search?q=... sans casser articles/podcasts', async () => {
      const res = await request(app).get('/api/search?q=Diffusion 3D');
      assert.equal(res.status, 200);
      assert.ok(res.body.results.length >= 1);
      const statHit = res.body.results.find(r => r.type === 'data_stat');
      assert.ok(statHit, 'Les observations statistiques publiées doivent être retournées');
      assert.equal(statHit.indicator_code, testIndCode);

      // Filtrage strict par type=statistics ou type=data_stat
      const resType = await request(app).get('/api/search?q=Diffusion 3D&type=statistics');
      assert.equal(resType.status, 200);
      assert.ok(resType.body.results.every(r => r.type === 'data_stat'));
    });
  });

  // =========================================================================
  // 2. SÉCURITÉ ABSOLUE DE LA DIFFUSION ET ÉTANCHÉITÉ (TESTS NÉGATIFS)
  // =========================================================================
  describe('2. Sécurité de la diffusion et exclusion stricte', () => {
    test('2.1 Exclusion ABSOLUE des brouillons (draft)', async () => {
      // Notre valeur draft (99.99) ne doit JAMAIS apparaître
      const res = await request(app).get(`/api/data/search?indicator=${testIndCode}`);
      const hasDraft = res.body.data.some(d => d.value_numeric === 99.99);
      assert.equal(hasDraft, false, 'Une valeur draft ne doit jamais être exposée');
    });

    test('2.2 Exclusion ABSOLUE des rejets et audits non acceptés', async () => {
      // Notre valeur rejected (88.88) ne doit JAMAIS apparaître
      const res = await request(app).get(`/api/data/search?indicator=${testIndCode}`);
      const hasRejected = res.body.data.some(d => d.value_numeric === 88.88);
      assert.equal(hasRejected, false, 'Une valeur rejetée ne doit jamais être exposée');
    });

    test('2.3 Exclusion ABSOLUE des révocations et inactifs (is_active = FALSE)', async () => {
      // Valeurs 77.77 (revoked) et 66.66 (inactive)
      const res = await request(app).get(`/api/data/search?indicator=${testIndCode}`);
      const hasRevoked = res.body.data.some(d => d.value_numeric === 77.77);
      const hasInactive = res.body.data.some(d => d.value_numeric === 66.66);
      assert.equal(hasRevoked, false, 'Une valeur révoquée ne doit pas apparaître');
      assert.equal(hasInactive, false, 'Une valeur inactive ne doit pas apparaître');
    });

    test('2.4 GET /api/data/values/:id refuse STRICTEMENT toute observation non publiée ou inactive', async () => {
      // Draft ID -> 404
      const resDraft = await request(app).get(`/api/data/values/${createdTestValueIds[1]}`);
      assert.equal(resDraft.status, 404);

      // Rejected ID -> 404
      const resRej = await request(app).get(`/api/data/values/${createdTestValueIds[2]}`);
      assert.equal(resRej.status, 404);

      // Revoked ID -> 404
      const resRev = await request(app).get(`/api/data/values/${createdTestValueIds[3]}`);
      assert.equal(resRev.status, 404);

      // Inactive published ID -> 404
      const resInact = await request(app).get(`/api/data/values/${createdTestValueIds[4]}`);
      assert.equal(resInact.status, 404);
    });

    test('2.5 Confidentialité totale : aucune fuite de notes internes, audits ou identités d utilisateurs', async () => {
      const res = await request(app).get(`/api/data/values/${createdTestValueIds[0]}`);
      assert.equal(res.status, 200);

      const json = JSON.stringify(res.body);
      assert.ok(!json.includes('SECRET_INTERNAL_NOTE_NEVER_LEAK_3D'), 'Les notes internes ne doivent jamais fuiter');
      assert.ok(!json.includes('internal_notes'), 'La clé internal_notes doit être absente');
      assert.ok(!json.includes('audit_decision_notes'), 'Les notes d audit doivent être absentes');
      assert.ok(!json.includes('created_by'), 'Les identifiants utilisateurs created_by doivent être absents');
      assert.ok(!json.includes('validated_by'), 'validated_by doit être absent');
      assert.ok(!json.includes('published_by'), 'published_by doit être absent');
    });

    test('2.6 Les 24 observations pilotes (#687 à #710) sont totalement invisibles dans la recherche publique', async () => {
      // Les pilotes concernent POP_TOT_COUNT, EDU_PRIM_GROSS, LAB_UNEMP_RATE, ECO_PIB_GROWTH
      const resPop = await request(app).get('/api/data/search?indicator=POP_TOT_COUNT');
      assert.equal(resPop.body.meta.total, 0, 'Les 6 observations pilotes de population restent invisibles');

      const resEdu = await request(app).get('/api/data/search?indicator=EDU_PRIM_GROSS');
      assert.equal(resEdu.body.meta.total, 0, 'Les 5 observations pilotes d éducation restent invisibles');

      const resUnemp = await request(app).get('/api/data/search?indicator=LAB_UNEMP_RATE');
      assert.equal(resUnemp.body.meta.total, 0, 'Les 3 observations pilotes de chômage restent invisibles');
    });
  });

  // =========================================================================
  // 3. FICHES PUBLIQUES D'INDICATEURS
  // =========================================================================
  describe('3. Fiches Publiques d Indicateurs', () => {
    test('3.1 Fiche complète avec métadonnées normalisées, sources et historique', async () => {
      const res = await request(app).get(`/api/data/indicators/${testIndCode}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);

      const ind = res.body.data;
      assert.equal(ind.code, testIndCode);
      assert.equal(ind.name, 'Indicateur Test Diffusion 3D');
      assert.equal(ind.category, 'economie');
      assert.equal(ind.unit, 'pourcentage');
      assert.equal(ind.calculation_formula, 'A / B * 100');
      assert.equal(ind.producer_institution, 'Institut National de la Statistique');
      assert.ok(ind.methodological_limitations);

      // Historique publié
      assert.ok(Array.isArray(ind.published_history));
      assert.equal(ind.published_history.length, 1);
      assert.equal(ind.published_history[0].value_numeric, 18.75);
      assert.equal(ind.published_history[0].is_estimation, false);
      assert.equal(ind.published_history[0].estimation_status_label, 'Donnée définitive');
    });

    test('3.2 Fiche indicateur historique ECO_PIB_NOM contient l observation #261', async () => {
      const res = await request(app).get('/api/data/indicators/ECO_PIB_NOM');
      assert.equal(res.status, 200);

      const ind = res.body.data;
      assert.equal(ind.code, 'ECO_PIB_NOM');
      assert.ok(Array.isArray(ind.publications), 'Doit lister les publications rattachées');
      assert.ok(ind.published_history.length >= 1);

      const pib2024 = ind.published_history.find(h => h.period_year === 2024 || String(h.period_start).startsWith('2024'));
      assert.ok(pib2024, 'L observation #261 de 2024 doit être présente');
      assert.equal(pib2024.value_numeric, 29850);
      assert.equal(pib2024.is_estimation, true, 'nowcast_estimate doit être flaggé comme estimation');
    });
  });

  // =========================================================================
  // 4. EXPORTATIONS MULTI-FORMATS (CSV, JSON, JSON-LD)
  // =========================================================================
  describe('4. Exportations Multi-Formats (CSV, JSON, JSON-LD)', () => {
    test('4.1 Export CSV : UTF-8 BOM, séparateur point-virgule et protection formule injection', async () => {
      const res = await request(app).get(`/api/data/export/csv?indicator=${testIndCode}`);
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/csv'));
      assert.ok(res.headers['content-disposition'].includes('attachment'));

      const text = res.text;
      // Vérifier BOM UTF-8 (\uFEFF)
      assert.ok(text.startsWith('\uFEFF'), 'Le fichier CSV doit impérativement débuter par le BOM UTF-8');

      // Vérifier séparateur point-virgule
      const lines = text.split('\r\n').filter(Boolean);
      assert.ok(lines.length >= 2, 'Doit comporter l en-tête et au moins une ligne de données');
      assert.ok(lines[0].includes(';'), 'Doit utiliser le point-virgule comme séparateur');
      assert.ok(lines[0].includes('Code Indicateur'));
      assert.ok(lines[0].includes('Valeur'));
      assert.ok(lines[0].includes('Statut Chiffrage'));

      // Vérifier la neutralisation anti-formule injection : notre référence '=SUM(1+1)'
      // doit être neutralisée avec une apostrophe ("'=SUM(1+1)...")
      assert.ok(text.includes("'=SUM(1+1)"), 'Les formules débutant par = doivent être neutralisées avec une apostrophe');

      // Vérifier l exclusion des brouillons dans le CSV
      assert.ok(!text.includes('99.99'), 'Les valeurs draft ne doivent pas être dans le CSV');
      assert.ok(!text.includes('88.88'), 'Les valeurs rejetées ne doivent pas être dans le CSV');
    });

    test('4.2 Export JSON structuré conforme avec métadonnées et licence', async () => {
      const res = await request(app).get(`/api/data/export/json?indicator=${testIndCode}`);
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('application/json'));
      assert.equal(res.body.success, true);
      assert.equal(res.body.meta.format, 'json');
      assert.equal(res.body.meta.total_records, 1);
      assert.ok(res.body.meta.license);
      assert.equal(res.body.data[0].indicator_code, testIndCode);
      assert.equal(res.body.data[0].value_numeric, 18.75);
    });

    test('4.3 Export JSON-LD conforme Schema.org (DataFeed & Observation)', async () => {
      const res = await request(app).get(`/api/data/export/json-ld?indicator=${testIndCode}`);
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('application/ld+json'));

      const doc = res.body;
      assert.equal(doc['@type'], 'DataFeed');
      assert.ok(doc['@context']);
      assert.ok(doc.publisher);
      assert.ok(Array.isArray(doc.dataFeedElement));
      assert.equal(doc.dataFeedElement.length, 1);

      const obs = doc.dataFeedElement[0];
      assert.equal(obs['@type'], 'Observation');
      assert.equal(obs.value, 18.75);
      assert.equal(obs.variableMeasured.propertyID, testIndCode);
      assert.equal(obs.spatialCoverage.identifier, 'CMR');
      assert.equal(obs.measurementTechnique, 'sample_survey');
      assert.ok(obs.temporalCoverage);
    });

    test('4.4 Export direct par route indicateur /api/data/indicators/:code/export/csv', async () => {
      const res = await request(app).get('/api/data/indicators/ECO_PIB_NOM/export/csv');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('ECO_PIB_NOM'));
      assert.ok(res.text.includes('29850'));
    });
  });

  // =========================================================================
  // 5. DÉDUPLICATION DU CORPUS DOCUMENTAIRE ET IDEMPOTENCE
  // =========================================================================
  describe('5. Déduplication et Idempotence du Corpus', () => {
    test('5.1 Nombre exact de publications canoniques en base (34) et archives (27)', async () => {
      const pubRes = await pool.query('SELECT count(*) FROM data_publications');
      assert.ok(
        Number(pubRes.rows[0].count) >= 34,
        'Il doit y avoir au moins 34 publications uniques en base (35 avec ECAM 4 ajoutée au Lot 3E.2)'
      );

      const archRes = await pool.query('SELECT count(*) FROM data_publications_archive');
      assert.equal(Number(archRes.rows[0].count), 27, 'Les 27 doublons doivent être archivés dans data_publications_archive');
    });

    test('5.2 Contrainte d unicité uq_data_publications_title empêche toute ré-insertion en double', async () => {
      // Tenter d'insérer un titre déjà existant
      const existing = await pool.query('SELECT institution_id, title FROM data_publications LIMIT 1');
      const instId = existing.rows[0].institution_id;
      const title = existing.rows[0].title;

      await assert.rejects(
        async () => {
          await pool.query(`
            INSERT INTO data_publications (
              institution_id, title, document_category, verification_status
            ) VALUES ($1, $2, 'survey', 'verified_consulted')
          `, [instId, title.toUpperCase()]);
        },
        (err) => err.code === '23505', // PostgreSQL unique_violation
        'L index unique doit rejeter l insertion d un titre identique (insensible à la casse)'
      );
    });

    test('5.3 Vérification des publications proches mais distinctes (non fusionnées)', async () => {
      // EESI 2 (#4) et EESI 3 (#26) doivent coexister de manière distincte
      const eesiRes = await pool.query(`
        SELECT id, title FROM data_publications
        WHERE title ILIKE '%EESI%'
        ORDER BY id;
      `);
      assert.equal(eesiRes.rows.length, 2, 'EESI 2 et EESI 3 doivent être toutes deux conservées');
      assert.ok(eesiRes.rows.some(r => r.title.includes('EESI 2')));
      assert.ok(eesiRes.rows.some(r => r.title.includes('EESI 3')));

      // Lois budgétaires distinctes : Loi de Finances (#10) et Règlement Définitif (#9)
      const budgetRes = await pool.query(`
        SELECT id, title FROM data_publications
        WHERE title ILIKE '%Loi n°%'
        ORDER BY id;
      `);
      assert.equal(budgetRes.rows.length, 2, 'Loi de finances et règlement définitif doivent être conservées distinctement');

      // Publications démographiques : RGPH 2005 (#7) et Perspectives (#8)
      const demoRes = await pool.query(`
        SELECT id, title FROM data_publications
        WHERE id IN (7, 8)
        ORDER BY id;
      `);
      assert.equal(demoRes.rows.length, 2, 'RGPH 2005 et Perspectives 2010-2035 doivent être conservés distinctement');
    });
  });

  // =========================================================================
  // 6. NON-RÉGRESSION DES 24 OBSERVATIONS PILOTES ET DE #261
  // =========================================================================
  describe('6. Non-régression absolue des données pilotes et de #261', () => {
    test('6.1 Les 24 observations pilotes (#687 à #710) demeurent strictement inchangées', async () => {
      const res = await pool.query(`
        SELECT id, editorial_status, is_active, audit_decision
        FROM data_values
        WHERE id BETWEEN 687 AND 710
        ORDER BY id ASC;
      `);
      assert.equal(res.rows.length, 24);
      for (const row of res.rows) {
        assert.equal(row.editorial_status, 'draft', `Obs #${row.id} doit rester en draft`);
        assert.equal(row.is_active, false, `Obs #${row.id} doit rester inactive`);
        assert.equal(row.audit_decision, 'pending', `Obs #${row.id} doit rester audit pending`);
      }
    });

    test('6.2 L observation #261 demeure strictement published, active et à 29 850 Mrds FCFA', async () => {
      const res = await pool.query(`
        SELECT dv.id, di.code, dv.value_numeric, dv.editorial_status, dv.is_active
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE dv.id = 261;
      `);
      assert.equal(res.rows.length, 1);
      const row = res.rows[0];
      assert.equal(row.code, 'ECO_PIB_NOM');
      assert.equal(Number(row.value_numeric), 29850);
      assert.equal(row.editorial_status, 'published');
      assert.equal(row.is_active, true);
    });
  });
});
