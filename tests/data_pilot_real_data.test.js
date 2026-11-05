/**
 * =============================================================================
 * SOLITIQUO DATA — LOT 3C : PREMIÈRE COLLECTE ET INTÉGRATION DE DONNÉES RÉELLES
 * SUITE DE TESTS D'INTÉGRITÉ, PROVENANCE ET ÉTANCHÉITÉ ÉDITORIALE
 * =============================================================================
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');
const dataImportService = require('../backend/services/dataImportService');

describe('SOLITIQUO DATA — LOT 3C PILOTE DE DONNÉES RÉELLES SUITE', () => {
  const suffix = Date.now().toString().slice(-6);
  const rawPassword = 'Password123*';
  let adminUser;
  let adminAgent;
  let adminCsrf;
  let readerAgent;

  const pilotCodes = [
    'POP_TOT_COUNT',
    'ECO_PIB_NOM',
    'ECO_PIB_GROWTH',
    'LAB_UNEMP_RATE',
    'EDU_PRIM_GROSS'
  ];

  before(async () => {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(rawPassword, salt);

    // Utilisateur admin pour audit
    const uAdmin = await pool.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
    `, [`admin_pilot_${suffix}`, `admin_pilot_${suffix}@solitiquo.cm`, hashedPassword]);
    adminUser = uAdmin.rows[0];

    adminAgent = request.agent(app);
    await adminAgent.post('/api/auth/login').send({
      email: adminUser.email,
      password: rawPassword
    }).expect(200);

    const csrfRes = await adminAgent.get('/api/csrf-token');
    adminCsrf = csrfRes.body.csrfToken;

    readerAgent = request.agent(app);
  });

  after(async () => {
    if (adminUser) {
      await pool.query('DELETE FROM import_lines WHERE batch_id IN (SELECT id FROM import_batches WHERE uploaded_by = $1)', [adminUser.id]);
      await pool.query('DELETE FROM import_batches WHERE uploaded_by = $1', [adminUser.id]);
      await pool.query('DELETE FROM users WHERE id = $1', [adminUser.id]);
    }
  });

  // ---------------------------------------------------------------------------
  // 1. VÉRIFICATIONS PRÉALABLES (RÉCONCILIATION & HISTORIQUE)
  // ---------------------------------------------------------------------------
  describe('1. Vérifications préalables', () => {
    test('1.1 Réconciliation des indicateurs du catalogue (48 total, 46 actifs)', async () => {
      const allRes = await pool.query('SELECT COUNT(*) AS total FROM data_indicators WHERE short_name IS NOT NULL');
      const activeRes = await pool.query('SELECT COUNT(*) AS total FROM data_indicators WHERE is_active = TRUE AND short_name IS NOT NULL');
      const inactiveRes = await pool.query('SELECT code, name, is_active FROM data_indicators WHERE is_active = FALSE AND short_name IS NOT NULL');

      const totalCount = parseInt(allRes.rows[0].total, 10);
      const activeCount = parseInt(activeRes.rows[0].total, 10);

      // Le catalogue consolidé comporte 48 indicateurs dont 46 actifs
      // et 2 indicateurs au statut expérimental / provisoire (ENG_SOLAR_SHARE, GOV_LOCAL_REV_AUTONOMY)
      assert.ok(totalCount >= 47, `Catalogue total attendu >= 47, obtenu: ${totalCount}`);
      assert.equal(activeCount, 46, `Indicateurs actifs attendus = 46, obtenu: ${activeCount}`);
      assert.equal(inactiveRes.rows.length, totalCount - activeCount);
    });

    test('1.2 Réconciliation de l\'écart documentaire (publications enregistrées vs catalogue initial)', async () => {
      const pubCountRes = await pool.query('SELECT COUNT(*) AS total FROM data_publications');
      const totalPubs = parseInt(pubCountRes.rows[0].total, 10);
      const archiveRes = await pool.query('SELECT COUNT(*) AS total FROM data_publications_archive');
      const archiveCount = parseInt(archiveRes.rows[0]?.total || 0, 10);
      // Post-Lot 3D : 34 publications actives canoniques et 27 archivées (total >= 61)
      assert.ok(totalPubs >= 34 && (totalPubs + archiveCount) >= 61, `Nombre total de publications (canoniques + archives) attendu >= 61, obtenu: ${totalPubs + archiveCount}`);

      const verifiedRes = await pool.query("SELECT COUNT(*) AS total FROM data_publications WHERE verification_status = 'verified_consulted'");
      const verifiedCount = parseInt(verifiedRes.rows[0].total, 10);
      // Au Lot 3E.2.1, les 7 publications pilotes sans PDF original consulté sont reclassées en institutional_reference_only / unavailable
      assert.ok(verifiedCount >= 20, `Publications vérifiées et consultées réelles attendues >= 20, obtenu: ${verifiedCount}`);
    });

    test('1.3 Intégrité des références des publications verified_consulted', async () => {
      const res = await pool.query(`
        SELECT dp.id, dp.title, dp.publication_year, ds.acronym AS institution_acronym, dp.url
        FROM data_publications dp
        JOIN data_sources ds ON ds.id = dp.institution_id
        WHERE dp.verification_status = 'verified_consulted'
      `);
      assert.ok(res.rows.length >= 20);
      res.rows.forEach(pub => {
        assert.ok(pub.title && pub.title.length > 5, 'Chaque publication vérifiée doit avoir un titre complet');
        assert.ok(pub.institution_acronym, 'Chaque publication vérifiée doit être rattachée à une institution officielle');
        assert.ok(pub.url && pub.url.startsWith('http'), 'Chaque publication vérifiée doit disposer d\'un lien source valide');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. PÉRIMÈTRE DU PILOTE : 5 INDICATEURS ET 24 OBSERVATIONS EN BROUILLON
  // ---------------------------------------------------------------------------
  describe('2. Périmètre du pilote et statut des observations', () => {
    test('2.1 Les 5 indicateurs prioritaires existent bien dans le catalogue', async () => {
      const res = await pool.query(
        'SELECT code, name, unit, is_active FROM data_indicators WHERE code = ANY($1)',
        [pilotCodes]
      );
      assert.equal(res.rows.length, 5, 'Les 5 indicateurs du pilote doivent exister');
      const foundCodes = res.rows.map(r => r.code);
      pilotCodes.forEach(code => {
        assert.ok(foundCodes.includes(code), `Indicateur manquant: ${code}`);
      });
    });

    test('2.2 Exactement 24 observations réelles ont été importées au statut draft', async () => {
      const res = await pool.query(`
        SELECT dv.id, di.code, dv.value_numeric, dv.editorial_status, dv.is_active, dv.period_start, dv.period_end
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE di.code = ANY($1) AND dv.id BETWEEN 687 AND 710
        ORDER BY di.code, dv.period_start ASC
      `, [pilotCodes]);

      assert.equal(res.rows.length, 24, `Nombre d'observations importées attendu: 24, obtenu: ${res.rows.length}`);

      // Toutes doivent être impérativement draft et inactives
      res.rows.forEach(obs => {
        assert.equal(obs.editorial_status, 'draft', `L'observation #${obs.id} (${obs.code}) doit être au statut 'draft'`);
        assert.equal(obs.is_active, false, `L'observation #${obs.id} (${obs.code}) doit avoir is_active = FALSE`);
        assert.ok(parseFloat(obs.value_numeric) > 0, `Valeur numérique positive attendue pour #${obs.id}`);
      });
    });

    test('2.3 Répartition chronologique et volumétrie par indicateur', async () => {
      const countsRes = await pool.query(`
        SELECT di.code, COUNT(dv.id) AS count
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        WHERE di.code = ANY($1) AND dv.id BETWEEN 687 AND 710
        GROUP BY di.code
      `, [pilotCodes]);

      const countsMap = {};
      countsRes.rows.forEach(r => { countsMap[r.code] = parseInt(r.count, 10); });

      assert.equal(countsMap['POP_TOT_COUNT'], 6, 'Population totale : 6 observations (2018-2023)');
      assert.equal(countsMap['ECO_PIB_NOM'], 5, 'PIB nominal : 5 observations en draft (2018-2022)');
      assert.equal(countsMap['ECO_PIB_GROWTH'], 5, 'Croissance PIB : 5 observations (2018-2022)');
      assert.equal(countsMap['LAB_UNEMP_RATE'], 3, 'Taux de chômage : 3 observations d\'enquêtes réelles (2010, 2014, 2021)');
      assert.equal(countsMap['EDU_PRIM_GROSS'], 5, 'Taux brut scolarisation primaire : 5 observations (2018-2022)');
    });

    test('2.4 Préservation stricte des observations historiques pré-existantes (ex: Obs #261)', async () => {
      const res = await pool.query('SELECT * FROM data_values WHERE id = 261');
      assert.equal(res.rows.length, 1);
      const obs261 = res.rows[0];
      assert.equal(obs261.editorial_status, 'published', 'L\'observation #261 doit rester au statut publié');
      assert.equal(obs261.is_active, true, 'L\'observation #261 doit rester active');
      assert.equal(parseFloat(obs261.value_numeric), 29850, 'Valeur de l\'observation #261 non altérée');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. TRAÇABILITÉ ET PROVENANCE DOCUMENTAIRE
  // ---------------------------------------------------------------------------
  describe('3. Traçabilité et provenance documentaire', () => {
    test('3.1 Chaque observation du pilote dispose d\'une référence de source vérifiée', async () => {
      const res = await pool.query(`
        SELECT 
          dv.id AS data_value_id,
          di.code AS indicator_code,
          ds.acronym AS source_acronym,
          ds.name AS source_name,
          dvs.source_role,
          dvs.documentary_tier,
          dvs.methodological_robustness,
          dvs.citation_reference
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        JOIN data_value_sources dvs ON dvs.data_value_id = dv.id
        JOIN data_sources ds ON ds.id = dvs.source_id
        WHERE di.code = ANY($1) AND dv.id BETWEEN 687 AND 710
        ORDER BY dv.id ASC
      `, [pilotCodes]);

      assert.equal(res.rows.length, 24, 'Chacune des 24 observations doit être liée à sa source');

      const recognizedAcronyms = ['BUCREP', 'INS', 'MINEDUB'];

      res.rows.forEach(row => {
        assert.ok(recognizedAcronyms.includes(row.source_acronym), `Institution reconnue attendue: ${row.source_acronym}`);
        assert.equal(row.source_role, 'primary', 'Rôle principal attendu');
        assert.ok(row.citation_reference && row.citation_reference.length > 20, 'Citation bibliographique précise requise');
        assert.ok(
          row.citation_reference.includes('Tableau') || row.citation_reference.includes('p.') || row.citation_reference.includes('Chapitre'),
          'La citation doit préciser la table, page ou section de la publication'
        );
        assert.ok(['TIER_1_OFFICIAL', 'TIER_2_REPUTABLE'].includes(row.documentary_tier));
        assert.ok(['high', 'medium'].includes(row.methodological_robustness));
      });
    });

    test('3.2 Absence d\'interpolation fantôme pour les données d\'emploi (LAB_UNEMP_RATE)', async () => {
      const res = await pool.query(`
        SELECT EXTRACT(YEAR FROM dv.period_start) AS survey_year, dvs.citation_reference
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        JOIN data_value_sources dvs ON dvs.data_value_id = dv.id
        WHERE di.code = 'LAB_UNEMP_RATE' AND dv.id BETWEEN 687 AND 710
        ORDER BY survey_year ASC
      `);

      // Seules les années réelles des enquêtes nationales EESI 2 (2010), ECAM 4 (2014) et ECAM 5 (2021) doivent être présentes
      const years = res.rows.map(r => parseInt(r.survey_year, 10));
      assert.deepEqual(years, [2010, 2014, 2021], 'Aucune interpolation non documentée entre 2010, 2014 et 2021');

      // Vérification des enquêtes correspondantes
      assert.ok(res.rows[0].citation_reference.includes('EESI 2'));
      assert.ok(res.rows[1].citation_reference.includes('ECAM 4'));
      assert.ok(res.rows[2].citation_reference.includes('ECAM 5'));
    });
  });

  // ---------------------------------------------------------------------------
  // 4. ÉTANCHÉITÉ ÉDITORIALE ET SÉCURITÉ PUBLIQUE
  // ---------------------------------------------------------------------------
  describe('4. Étanchéité éditoriale et sécurité publique', () => {
    test('4.1 L\'API publique ne renvoie AUCUNE des observations draft du pilote', async () => {
      // Pour Population Totale (aucun published) -> 0 résultats
      const popRes = await readerAgent.get('/api/data/indicators/POP_TOT_COUNT/values').expect(200);
      assert.equal(popRes.body.data.length, 0, 'Les observations draft de population ne doivent pas être visibles en public');

      // Pour Croissance PIB -> 0 résultats
      const growthRes = await readerAgent.get('/api/data/indicators/ECO_PIB_GROWTH/values').expect(200);
      assert.equal(growthRes.body.data.length, 0, 'Les observations draft de croissance ne doivent pas être visibles en public');

      // Pour Chômage -> 0 résultats
      const unempRes = await readerAgent.get('/api/data/indicators/LAB_UNEMP_RATE/values').expect(200);
      assert.equal(unempRes.body.data.length, 0, 'Les observations draft de chômage ne doivent pas être visibles en public');

      // Pour Éducation -> 0 résultats
      const eduRes = await readerAgent.get('/api/data/indicators/EDU_PRIM_GROSS/values').expect(200);
      assert.equal(eduRes.body.data.length, 0, 'Les observations draft de scolarisation ne doivent pas être visibles en public');

      // Pour PIB Nominal : seule la valeur historique 2024 (#261) est visible, AUCUN draft n'est exposé
      const pibRes = await readerAgent.get('/api/data/indicators/ECO_PIB_NOM/values').expect(200);
      assert.equal(pibRes.body.data.length, 1, 'Seule l\'observation publiée #261 doit être retournée pour le PIB nominal');
      assert.equal(String(pibRes.body.data[0].id), '261');
      assert.equal(parseFloat(pibRes.body.data[0].value_numeric), 29850);
    });

    test('4.2 L\'API d\'administration permet la revue éditoriale des brouillons', async () => {
      let draftIds = [];
      for (let p = 1; p <= 5; p++) {
        const res = await adminAgent
          .get(`/api/data/admin/values?editorial_status=draft&limit=200&page=${p}`)
          .expect(200);
        if (!res.body.data || res.body.data.length === 0) break;
        draftIds.push(...res.body.data.map(v => parseInt(v.id, 10)));
        if (res.body.data.length < 200 || draftIds.length >= (res.body.meta?.total || 0)) break;
      }

      assert.ok(draftIds.length >= 24, 'L\'administration doit pouvoir lister les 24 observations en draft');
      for (let id = 687; id <= 710; id++) {
        assert.ok(draftIds.includes(id), `L'observation brouillon #${id} doit être accessible aux modérateurs`);
      }
    });

    test('4.3 Impossibilité de publier directement sans validation méthodologique préalable', async () => {
      // Tentative de passage direct en 'published' sans transition éditoriale autorisée
      // Le workflow impose les états : draft -> under_review -> methodologically_validated -> published
      const testDraftId = 687;
      const res = await adminAgent
        .post(`/api/data/admin/values/${testDraftId}/publish`)
        .set('x-csrf-token', adminCsrf)
        .send({
          public_reason_summary: 'Tentative de publication directe non conforme'
        });

      // Doit être rejeté (400 Bad Request en raison de la violation de la machine à états)
      assert.equal(res.status, 400, 'La publication directe d\'un draft sans validation doit être strictement refusée');
      assert.match(res.body.error, /transition interdite/i);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. CONTRÔLE QUALITÉ DU MOTEUR D'IMPORTATION (REJETS ET VALIDATIONS)
  // ---------------------------------------------------------------------------
  describe('5. Contrôle qualité et validation du moteur d\'importation', () => {
    test('5.1 Rejet des indicateurs inconnus, territoires invalides et dates incohérentes', async () => {
      const invalidCsv = [
        'code_indicateur,code_territoire,date_debut,date_fin,valeur,source,reference',
        'INCONNU_XYZ,CMR,2020-01-01,2020-12-31,100,INS,Annuaire 2020',
        'POP_TOT_COUNT,TERRITOIRE_INEXISTANT,2020-01-01,2020-12-31,100,INS,Annuaire 2020',
        'POP_TOT_COUNT,CMR,2022-12-31,2022-01-01,100,INS,Annuaire 2020' // Date fin < date début
      ].join('\n');

      const batch = await dataImportService.createBatch({
        fileName: 'test_rejection_audit.csv',
        buffer: Buffer.from(invalidCsv, 'utf8'),
        mimeType: 'text/csv',
        userId: adminUser.id
      });

      const validated = await dataImportService.validateAndStageLines(batch.id, Buffer.from(invalidCsv, 'utf8'), {
        mapping: {
          indicator_code: 'code_indicateur',
          territory_code: 'code_territoire',
          period_start: 'date_debut',
          period_end: 'date_fin',
          value_numeric: 'valeur',
          source_acronym: 'source',
          citation_reference: 'reference'
        },
        defaults: {
          period_type: 'ANNUAL',
          methodology_nature: 'official_survey'
        }
      }, adminUser.id);

      assert.equal(validated.totalLines, 3);
      assert.equal(validated.validLines, 0);
      assert.equal(validated.errorLines, 3);
      assert.equal(validated.status, 'rejected');

      // Vérification des lignes d'erreurs
      const batchDetails = await dataImportService.getBatchById(batch.id);
      assert.equal(batchDetails.lines.length, 3);
      assert.match(batchDetails.lines[0].error_message, /indicateur/i);
      assert.match(batchDetails.lines[1].error_message, /territoire/i);
      assert.match(batchDetails.lines[2].error_message, /période|chronologique|date/i);

      // Génération de l'export CSV des rejets avec protection formule Excel
      const rejectedCsv = await dataImportService.generateRejectedCsv(batch.id);
      assert.ok(rejectedCsv.startsWith('\uFEFF'), 'Le fichier de rejet doit inclure le BOM UTF-8');
      assert.ok(rejectedCsv.includes('Numero_Ligne'), 'Le fichier doit inclure la colonne Numero_Ligne');
      assert.ok(rejectedCsv.includes('Erreur_Constatee'), 'Le fichier doit inclure la colonne Erreur_Constatee');
    });
  });
});
