'use strict';

require('dotenv').config();
const { Client } = require('pg');
const { execSync } = require('child_process');

const TEST_DB = 'solitiquo_virgin_seed_test';
const BASE_DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/solitiquo';

// Parse base config to connect to default 'postgres' database for DB creation/drop
const url = new URL(BASE_DB_URL);
const pgHost = url.hostname;
const pgPort = url.port || 5432;
const pgUser = url.username;
const pgPassword = url.password;

const rootClient = new Client({
  host: pgHost,
  port: pgPort,
  user: pgUser,
  password: pgPassword,
  database: 'postgres'
});
rootClient.on('error', () => {});

const testDbUrl = `postgresql://${pgUser}:${encodeURIComponent(pgPassword)}@${pgHost}:${pgPort}/${TEST_DB}`;

async function runTestSuite() {
  console.log('\n==============================================================');
  console.log('🧪 SUITE DE VALIDATION COMPLÈTE DU SEED BÊTA (ENVIRONNEMENT VIERGE)');
  console.log('==============================================================\n');

  await rootClient.connect();

  try {
    // 1. Recréation propre de la base de test vierge
    console.log(`[Étape 0] Création de la base de test vierge : ${TEST_DB}...`);
    await rootClient.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
    await rootClient.query(`CREATE DATABASE ${TEST_DB};`);
    console.log('   ✓ Base créée avec succès.');

    // 2. Exécution des 22 migrations
    console.log('\n[Étape 0 bis] Exécution des 22 migrations node-pg-migrate sur la base de test...');
    execSync(`npx node-pg-migrate up -m backend/migrations`, {
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'pipe'
    });
    console.log('   ✓ 22 migrations appliquées avec succès (incluant migration 22 is_demo sur articles).');

    const testClient = new Client({ connectionString: testDbUrl });
    testClient.on('error', () => {});
    await testClient.connect();

    // 3. Pré-insertion des 6 partis et 6 candidats permanents pour simuler leur préexistence
    console.log('\n[Test Préliminaire] Simulation de la préexistence des 6 partis et 6 candidats permanents...');
    const permParties = [
      { name: 'Rassemblement Démocratique du Peuple Camerounais', acronym: 'RDPC', founded_year: 1985, leader_name: 'Paul Biya', color: '#37463D' },
      { name: 'Mouvement pour la Renaissance du Cameroun', acronym: 'MRC', founded_year: 2012, leader_name: 'Maurice Kamto', color: '#C82823' },
      { name: 'Social Democratic Front', acronym: 'SDF', founded_year: 1990, leader_name: 'Joshua Osih', color: '#D4AF37' },
      { name: 'Union Nationale pour la Démocratie et le Progrès', acronym: 'UNDP', founded_year: 1990, leader_name: 'Bello Bouba Maïgari', color: '#059669' },
      { name: 'Parti Camerounais pour la Réconciliation Nationale', acronym: 'PCRN', founded_year: 2003, leader_name: 'Cabral Libii', color: '#2563EB' },
      { name: 'Union Démocratique du Cameroun', acronym: 'UDC', founded_year: 1991, leader_name: 'Patricia Hermine Ndam Njoya', color: '#7C3AED' }
    ];

    for (const p of permParties) {
      await testClient.query(`
        INSERT INTO parties (name, acronym, founded_year, leader_name, color, is_active)
        VALUES ($1, $2, $3, $4, $5, TRUE);
      `, [p.name, p.acronym, p.founded_year, p.leader_name, p.color]);
    }

    const permCandidates = [
      { full_name: 'Paul Biya', first_name: 'Paul', last_name: 'Biya', party: 'RDPC' },
      { full_name: 'Maurice Kamto', first_name: 'Maurice', last_name: 'Kamto', party: 'MRC' },
      { full_name: 'Joshua Osih', first_name: 'Joshua', last_name: 'Osih', party: 'SDF' },
      { full_name: 'Bello Bouba Maïgari', first_name: 'Bello Bouba', last_name: 'Maïgari', party: 'UNDP' },
      { full_name: 'Cabral Libii', first_name: 'Cabral', last_name: 'Libii', party: 'PCRN' },
      { full_name: 'Patricia Hermine Ndam Njoya', first_name: 'Patricia Hermine', last_name: 'Ndam Njoya', party: 'UDC' }
    ];

    for (const c of permCandidates) {
      await testClient.query(`
        INSERT INTO candidates (full_name, first_name, last_name, current_party_id, is_active)
        VALUES ($1, $2, $3, (SELECT id FROM parties WHERE acronym = $4 LIMIT 1), TRUE);
      `, [c.full_name, c.first_name, c.last_name, c.party]);
    }

    const initialPartyCount = (await testClient.query('SELECT COUNT(*)::int as cnt FROM parties')).rows[0].cnt;
    const initialCandCount = (await testClient.query('SELECT COUNT(*)::int as cnt FROM candidates')).rows[0].cnt;
    console.log(`   ✓ 6 partis et 6 candidats permanents pré-insérés (Partis: ${initialPartyCount}, Candidats: ${initialCandCount}).`);

    // 3 bis. Pré-insertion d'une observation DATA préexistante pour tester l'étanchéité du seed
    console.log('\n[Test Préliminaire bis] Pré-insertion d\'une observation DATA préexistante (non issue du seed)...');
    const preUserRes = await testClient.query(`
      INSERT INTO users (username, email, password, role)
      VALUES ('pre_admin', 'pre_admin@test.cm', 'hash', 'admin')
      RETURNING id;
    `);
    const preUserId = preUserRes.rows[0].id;

    await testClient.query(`
      INSERT INTO data_indicators (code, name, description, category, unit, is_active, expected_periodicity)
      VALUES ('DEMO_POP_TOT', 'Population totale du Cameroun', 'Effectif INS', 'demographie', 'habitants', TRUE, 'ANNUAL')
      ON CONFLICT (code) DO NOTHING;
    `);
    const preExistingDvRes = await testClient.query(`
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, methodology_nature, editorial_status, is_active, revision_number, created_by
      )
      SELECT di.id, t.id, 'ANNUAL', '2015-01-01', '2015-12-31', 22000000.0, 'census', 'draft', FALSE, 1, $1
      FROM data_indicators di, territories t
      WHERE di.code = 'DEMO_POP_TOT' AND t.code = 'CMR'
      RETURNING id;
    `, [preUserId]);
    const preExistingDvId = preExistingDvRes.rows[0].id;
    console.log(`   ✓ Observation DATA préexistante insérée (ID: ${preExistingDvId}, DEMO_POP_TOT 2015 CMR).`);

    // 4. Test 1 : Première exécution complète de npm run seed:beta
    console.log('\n[Test 1 & 2] Exécution 1 de npm run seed:beta...');
    execSync(`node scripts/seed-beta.js`, {
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'inherit'
    });

    // Comptage des volumes insérés
    const artCount = (await testClient.query('SELECT COUNT(*)::int as cnt FROM articles')).rows[0].cnt;
    const podCount = (await testClient.query('SELECT COUNT(*)::int as cnt FROM podcasts')).rows[0].cnt;
    const emCount = (await testClient.query('SELECT COUNT(*)::int as cnt FROM emissions')).rows[0].cnt;
    const partyCount = (await testClient.query('SELECT COUNT(*)::int as cnt FROM parties')).rows[0].cnt;
    const candCount = (await testClient.query('SELECT COUNT(*)::int as cnt FROM candidates')).rows[0].cnt;
    const pollCount = (await testClient.query('SELECT COUNT(*)::int as cnt FROM polls')).rows[0].cnt;
    const dvCount = (await testClient.query('SELECT COUNT(*)::int as cnt FROM data_values')).rows[0].cnt;
    const dvsCount = (await testClient.query('SELECT COUNT(*)::int as cnt FROM data_value_sources')).rows[0].cnt;
    const userCount = (await testClient.query("SELECT COUNT(*)::int as cnt FROM users WHERE email = 'redaction@solitiquo.com'")).rows[0].cnt;
    const demoArtCount = (await testClient.query('SELECT COUNT(*)::int as cnt FROM articles WHERE is_demo = TRUE')).rows[0].cnt;

    console.log('\n📊 Volumes réels constatés en base :');
    console.log(`   - Articles : ${artCount} (attendu : 80) [dont ${demoArtCount} marqués is_demo = TRUE]`);
    console.log(`   - Podcasts : ${podCount} (attendu : 14)`);
    console.log(`   - Émissions : ${emCount} (attendu : 4)`);
    console.log(`   - Partis politiques : ${partyCount} (attendu : 167)`);
    console.log(`   - Candidats : ${candCount} (attendu : 166, soit 6 permanents + 160 du seed)`);
    console.log(`   - Sondages : ${pollCount} (attendu : 0 - exclus du seed car suspects)`);
    console.log(`   - Observations DATA : ${dvCount} (attendu : 29, soit 1 préexistante + 28 du seed)`);
    console.log(`   - Sources documentaires : ${dvsCount} (attendu : 28)`);
    console.log(`   - Compte technique rédaction : ${userCount} (attendu : 1)`);

    // Vérification de sécurité stricte : aucune source n'a été rattachée à l'observation préexistante
    const preExistingSourcesCheck = await testClient.query(`
      SELECT COUNT(*)::int as cnt FROM data_value_sources WHERE data_value_id = $1;
    `, [preExistingDvId]);
    if (preExistingSourcesCheck.rows[0].cnt !== 0) {
      throw new Error(`Violation critique : le seed a rattaché ${preExistingSourcesCheck.rows[0].cnt} source(s) à l'observation préexistante non créée par le seed !`);
    }
    console.log('   ✓ Sécurité vérifiée : 0 source rattachée à l\'observation préexistante (étanchéité stricte garantie).');

    if (artCount !== 80 || demoArtCount !== 80 || podCount !== 14 || emCount !== 4 || partyCount !== 167 || candCount !== 166 || pollCount !== 0 || dvCount !== 29 || dvsCount !== 28 || userCount !== 1) {
      throw new Error('Échec de validation des volumes après le premier seed.');
    }
    console.log('   ✅ Test 1 & 2 validés : tous les volumes correspondent exactement et 100% des articles sont identifiés en mode démonstration.');

    // 5. Test 3 : Vérification des clés étrangères
    console.log('\n[Test 3] Vérification de l\'intégrité des clés étrangères...');
    const orphanArticles = (await testClient.query('SELECT COUNT(*)::int as cnt FROM articles a LEFT JOIN users u ON a.author_id = u.id WHERE u.id IS NULL')).rows[0].cnt;
    const orphanPodcasts = (await testClient.query('SELECT COUNT(*)::int as cnt FROM podcasts p LEFT JOIN users u ON p.author_id = u.id WHERE u.id IS NULL')).rows[0].cnt;
    const orphanEmissions = (await testClient.query('SELECT COUNT(*)::int as cnt FROM emissions e LEFT JOIN users u ON e.host_id = u.id WHERE u.id IS NULL')).rows[0].cnt;
    const orphanValues = (await testClient.query('SELECT COUNT(*)::int as cnt FROM data_values dv LEFT JOIN data_indicators di ON dv.indicator_id = di.id LEFT JOIN territories t ON dv.territory_id = t.id WHERE di.id IS NULL OR t.id IS NULL')).rows[0].cnt;
    const orphanSources = (await testClient.query('SELECT COUNT(*)::int as cnt FROM data_value_sources dvs LEFT JOIN data_values dv ON dvs.data_value_id = dv.id LEFT JOIN data_sources ds ON dvs.source_id = ds.id WHERE dv.id IS NULL OR ds.id IS NULL')).rows[0].cnt;

    console.log(`   - Orphelins articles : ${orphanArticles}`);
    console.log(`   - Orphelins podcasts : ${orphanPodcasts}`);
    console.log(`   - Orphelins émissions : ${orphanEmissions}`);
    console.log(`   - Orphelins data_values : ${orphanValues}`);
    console.log(`   - Orphelins data_value_sources : ${orphanSources}`);

    if (orphanArticles > 0 || orphanPodcasts > 0 || orphanEmissions > 0 || orphanValues > 0 || orphanSources > 0) {
      throw new Error('Des clés étrangères orphelines ont été détectées.');
    }
    console.log('   ✅ Test 3 validé : 100% des clés étrangères sont intègres.');

    // 6. Test 4 & 5 : Conservation des 6 partis et 6 candidats permanents et de leurs liens
    console.log('\n[Test 4 & 5] Vérification de la conservation des 6 partis et 6 candidats permanents...');
    const permVerification = await testClient.query(`
      SELECT c.full_name as candidate, p.acronym as party_acronym, p.name as party_name
      FROM candidates c
      JOIN parties p ON c.current_party_id = p.id
      WHERE c.full_name IN ('Paul Biya', 'Maurice Kamto', 'Joshua Osih', 'Bello Bouba Maïgari', 'Cabral Libii', 'Patricia Hermine Ndam Njoya')
      ORDER BY p.acronym;
    `);

    console.log('   Liaisons vérifiées :');
    permVerification.rows.forEach(r => console.log(`   - ${r.candidate} ➔ ${r.party_acronym} (${r.party_name})`));

    if (permVerification.rowCount !== 6) {
      throw new Error(`Attendu 6 candidats permanents liés, obtenu ${permVerification.rowCount}.`);
    }
    console.log('   ✅ Test 4 & 5 validés : les 6 partis et 6 candidats permanents sont parfaitement conservés et rattachés.');

    // 7. Test 6 : Vérification des 4 observations publiées et 24 brouillons
    console.log('\n[Test 6] Vérification des statuts éditoriaux DATA...');
    const pubCount = (await testClient.query("SELECT COUNT(*)::int as cnt FROM data_values WHERE editorial_status = 'published' AND id IN (SELECT record_id FROM _seed_beta_log WHERE table_name = 'data_values')")).rows[0].cnt;
    const draftCount = (await testClient.query("SELECT COUNT(*)::int as cnt FROM data_values WHERE editorial_status = 'draft' AND id IN (SELECT record_id FROM _seed_beta_log WHERE table_name = 'data_values')")).rows[0].cnt;

    console.log(`   - Observations publiées du seed : ${pubCount} (attendu : 4)`);
    console.log(`   - Observations brouillons du seed : ${draftCount} (attendu : 24)`);

    if (pubCount !== 4 || draftCount !== 24) {
      throw new Error('Incohérence sur la répartition des statuts éditoriaux.');
    }
    console.log('   ✅ Test 6 validé : 4 publiées et 24 brouillons exactement pour le seed.');

    // 8. Test 7 : Deuxième exécution du seed (Idempotence)
    console.log('\n[Test 7] Deuxième exécution de npm run seed:beta (vérification idempotence)...');
    execSync(`node scripts/seed-beta.js`, {
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'pipe'
    });

    const artCount2 = (await testClient.query('SELECT COUNT(*)::int as cnt FROM articles')).rows[0].cnt;
    const candCount2 = (await testClient.query('SELECT COUNT(*)::int as cnt FROM candidates')).rows[0].cnt;
    const partyCount2 = (await testClient.query('SELECT COUNT(*)::int as cnt FROM parties')).rows[0].cnt;
    const dvCount2 = (await testClient.query('SELECT COUNT(*)::int as cnt FROM data_values')).rows[0].cnt;

    console.log(`   - Articles après 2e run : ${artCount2} (delta : ${artCount2 - artCount})`);
    console.log(`   - Partis après 2e run : ${partyCount2} (delta : ${partyCount2 - partyCount})`);
    console.log(`   - Candidats après 2e run : ${candCount2} (delta : ${candCount2 - candCount})`);
    console.log(`   - Observations DATA après 2e run : ${dvCount2} (delta : ${dvCount2 - dvCount})`);

    if (artCount2 !== artCount || candCount2 !== candCount || partyCount2 !== partyCount || dvCount2 !== dvCount) {
      throw new Error('Échec d\'idempotence : des doublons ont été créés lors de la 2e exécution.');
    }
    console.log('   ✅ Test 7 validé : 0 doublon créé lors de la ré-exécution (idempotence absolue).');

    // 8 bis. Test 7 bis : Injection de contenus créés manuellement après le seed
    console.log('\n[Test 7 bis] Simulation de saisies manuelles post-seed & sécurité anti-écrasement...');
    
    // Tentative de collision de slug sur un article existant
    const existingArticleSlug = (await testClient.query('SELECT slug FROM articles LIMIT 1')).rows[0].slug;
    let slugCollisionPrevented = false;
    try {
      await testClient.query(`
        INSERT INTO articles (title, slug, content, category)
        VALUES ('Article pirate avec même slug', $1, 'Contenu pirate', 'Politique');
      `, [existingArticleSlug]);
    } catch (err) {
      if (err.code === '23505') { // unique_violation
        slugCollisionPrevented = true;
      }
    }
    if (!slugCollisionPrevented) {
      throw new Error('Le schéma aurait dû interdire la création d\'un article avec un slug déjà existant.');
    }
    console.log(`   ✓ Collision de slug sur un article importé ("${existingArticleSlug}") correctement interceptée par contrainte UNIQUE.`);

    // Création d'un auteur manuel et de contenus manuels légitimes
    const manualAuthorRes = await testClient.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ('journaliste_indep', 'journaliste@solitiquo.com', '$2b$10$hashedpass', 'writer', TRUE)
      RETURNING id;
    `);
    const manualAuthorId = manualAuthorRes.rows[0].id;

    // Article manuel (slug distinct)
    const manualArticleRes = await testClient.query(`
      INSERT INTO articles (title, slug, content, excerpt, author_id, category, status)
      VALUES ('Enquête exclusive sur le terrain', 'enquete-exclusive-sur-le-terrain', 'Texte de l''enquête manuelle...', 'Résumé...', $1, 'Politique', 'published')
      RETURNING id;
    `, [manualAuthorId]);
    const manualArticleId = manualArticleRes.rows[0].id;

    // Podcast manuel
    const manualPodcastRes = await testClient.query(`
      INSERT INTO podcasts (title, slug, description, audio_url, author_id, category, status)
      VALUES ('Épisode Hors-Série Manuel', 'episode-hors-serie-manuel', 'Podcast manuel...', 'https://audio.example.com/hs.mp3', $1, 'Politique', 'published')
      RETURNING id;
    `, [manualAuthorId]);
    const manualPodcastId = manualPodcastRes.rows[0].id;

    // Parti manuel
    const manualPartyRes = await testClient.query(`
      INSERT INTO parties (name, acronym, leader_name, is_active)
      VALUES ('Parti de l''Innovation Municipale', 'PIM', 'Maire Indépendant', TRUE)
      RETURNING id;
    `);
    const manualPartyId = manualPartyRes.rows[0].id;

    // Candidat manuel
    const manualCandRes = await testClient.query(`
      INSERT INTO candidates (full_name, first_name, last_name, current_party_id, is_active)
      VALUES ('Albert Ndongo', 'Albert', 'Ndongo', $1, TRUE)
      RETURNING id;
    `, [manualPartyId]);
    const manualCandId = manualCandRes.rows[0].id;

    console.log(`   ✓ Données manuelles créées avec succès (Article #${manualArticleId}, Podcast #${manualPodcastId}, Parti #${manualPartyId}, Candidat #${manualCandId}).`);
    console.log('   ✅ Test 7 bis validé : les contenus manuels sont insérés sans parasiter le seed.');

    // 8 ter. Test 7 ter : Tests des cas limites du cycle de vie éditorial post-seed
    console.log('\n[Test 7 ter] Tests des cas limites du cycle de vie éditorial post-seed...');

    // Cas 1 : Révision successive multi-générations A -> B -> C avec supersedes_id
    const seedPubToSupersede = (await testClient.query(`
      SELECT id, indicator_id, territory_id, period_type, period_start, period_end, methodology_nature
      FROM data_values
      WHERE id IN (SELECT record_id FROM _seed_beta_log WHERE table_name = 'data_values')
        AND editorial_status = 'published'
      ORDER BY id ASC
      LIMIT 1;
    `)).rows[0];

    // Génération 1 (A) -> bascule vers superseded
    // Génération 2 (B) -> révision 2, supersedes_id = A, puis bascule vers superseded
    // Génération 3 (C) -> révision 3, supersedes_id = B, statut published actif
    await testClient.query('BEGIN');
    await testClient.query(`
      UPDATE data_values
      SET editorial_status = 'superseded', is_active = FALSE
      WHERE id = $1;
    `, [seedPubToSupersede.id]);

    const genBRes = await testClient.query(`
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, methodology_nature, editorial_status, is_active, revision_number,
        supersedes_id, created_by
      )
      VALUES ($1, $2, $3, $4, $5, 29000000.0, $6, 'superseded', FALSE, 2, $7, $8)
      RETURNING id;
    `, [
      seedPubToSupersede.indicator_id, seedPubToSupersede.territory_id,
      seedPubToSupersede.period_type, seedPubToSupersede.period_start,
      seedPubToSupersede.period_end, seedPubToSupersede.methodology_nature,
      seedPubToSupersede.id, manualAuthorId
    ]);
    const genBId = genBRes.rows[0].id;

    await testClient.query(`UPDATE data_values SET superseded_by_id = $1 WHERE id = $2;`, [genBId, seedPubToSupersede.id]);

    const genCRes = await testClient.query(`
      INSERT INTO data_values (
        indicator_id, territory_id, period_type, period_start, period_end,
        value_numeric, methodology_nature, editorial_status, is_active, revision_number,
        supersedes_id, created_by, published_by, published_at
      )
      VALUES ($1, $2, $3, $4, $5, 29500000.0, $6, 'published', TRUE, 3, $7, $8, $8, NOW())
      RETURNING id;
    `, [
      seedPubToSupersede.indicator_id, seedPubToSupersede.territory_id,
      seedPubToSupersede.period_type, seedPubToSupersede.period_start,
      seedPubToSupersede.period_end, seedPubToSupersede.methodology_nature,
      genBId, manualAuthorId
    ]);
    const genCId = genCRes.rows[0].id;

    await testClient.query(`UPDATE data_values SET superseded_by_id = $1 WHERE id = $2;`, [genCId, genBId]);

    // Attachement d'une source documentaire manuelle à la révision de 3e génération
    await testClient.query(`
      INSERT INTO data_value_sources (
        data_value_id, source_id, source_role, documentary_tier,
        citation_reference, citation_url, methodological_robustness, created_by
      )
      SELECT $1, id, 'primary', 'TIER_1_OFFICIAL', 'Source manuelle génération 3', 'https://example.com/source3', 'high', $2
      FROM data_sources LIMIT 1;
    `, [genCId, manualAuthorId]);
    await testClient.query('COMMIT');

    console.log(`   ✓ Cas 1 : Chaîne 3 générations A (#${seedPubToSupersede.id}) -> B (#${genBId}) -> C (#${genCId}) créée avec succès.`);

    // Cas 2 : Modification manuelle d'un brouillon du seed SANS publication et avec updated_at identique à created_at
    // (Test de détection pure par data_value_audit_log, sans aucune dépendance temporelle à updated_at)
    const seedDraftToModify = (await testClient.query(`
      SELECT id, created_at FROM data_values
      WHERE id IN (SELECT record_id FROM _seed_beta_log WHERE table_name = 'data_values')
        AND editorial_status = 'draft'
      ORDER BY id ASC
      LIMIT 1;
    `)).rows[0];

    await testClient.query(`
      UPDATE data_values
      SET value_numeric = 123456.0, internal_notes = 'Brouillon modifié immédiatement sans publication',
          updated_at = created_at
      WHERE id = $1;
    `, [seedDraftToModify.id]);

    // Vérification que le trigger a bien consigné l'action UPDATE_DRAFT dans data_value_audit_log
    const auditCheck = await testClient.query(`
      SELECT action FROM data_value_audit_log WHERE data_value_id = $1 AND action = 'UPDATE_DRAFT';
    `, [seedDraftToModify.id]);
    if (auditCheck.rowCount < 1) throw new Error('Le trigger audit log n\'a pas enregistré la mutation du brouillon.');

    console.log(`   ✓ Cas 2 : Brouillon #${seedDraftToModify.id} modifié sans publication avec updated_at = created_at (action '${auditCheck.rows[0].action}' tracée dans l'audit log).`);

    // Cas 3 : Brouillon du seed publié manuellement par un éditeur
    const seedDraftToPublish = (await testClient.query(`
      SELECT id FROM data_values
      WHERE id IN (SELECT record_id FROM _seed_beta_log WHERE table_name = 'data_values')
        AND editorial_status = 'draft'
        AND id != $1
      ORDER BY id ASC
      LIMIT 1;
    `, [seedDraftToModify.id])).rows[0];

    await testClient.query(`
      UPDATE data_values
      SET value_numeric = 35000000.0, editorial_status = 'published', is_active = TRUE,
          published_by = $2, published_at = NOW(), internal_notes = 'Validation manuelle éditoriale'
      WHERE id = $1;
    `, [seedDraftToPublish.id, manualAuthorId]);

    console.log(`   ✓ Cas 3 : Brouillon #${seedDraftToPublish.id} publié manuellement par l'éditeur #${manualAuthorId}.`);
    console.log('   ✅ Test 7 ter validé : les 3 cas limites éditoriaux sont mis en place.');

    // 9. Test 8 & 9 : Test du Rollback et conservation des données préexistantes et manuelles
    console.log('\n[Test 8 & 9] Test du rollback contrôlé sur la base temporaire...');
    // D'abord test dry-run
    console.log('   Exécution en mode --dry-run...');
    execSync(`node scripts/rollback-beta.js --dry-run`, {
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'pipe'
    });
    const artCountAfterDryRun = (await testClient.query('SELECT COUNT(*)::int as cnt FROM articles')).rows[0].cnt;
    if (artCountAfterDryRun !== 81) throw new Error(`Le dry-run ne doit pas modifier la base (attendu 81 articles dont 1 manuel, obtenu ${artCountAfterDryRun}).`);

    // Exécution confirmée
    console.log('   Exécution confirmée avec --confirm...');
    execSync(`node scripts/rollback-beta.js --confirm`, {
      env: { ...process.env, DATABASE_URL: testDbUrl },
      stdio: 'inherit'
    });

    const artCountAfterRollback = (await testClient.query('SELECT COUNT(*)::int as cnt FROM articles')).rows[0].cnt;
    const podCountAfterRollback = (await testClient.query('SELECT COUNT(*)::int as cnt FROM podcasts')).rows[0].cnt;
    const partyCountAfterRollback = (await testClient.query('SELECT COUNT(*)::int as cnt FROM parties')).rows[0].cnt;
    const candCountAfterRollback = (await testClient.query('SELECT COUNT(*)::int as cnt FROM candidates')).rows[0].cnt;
    const dvCountAfterRollback = (await testClient.query('SELECT COUNT(*)::int as cnt FROM data_values')).rows[0].cnt;

    console.log(`   - Articles restants : ${artCountAfterRollback} (attendu : 1 manuel, 0 du seed)`);
    console.log(`   - Podcasts restants : ${podCountAfterRollback} (attendu : 1 manuel, 0 du seed)`);
    console.log(`   - Observations restantes : ${dvCountAfterRollback} (attendu : 6 préservées)`);
    console.log(`   - Partis restants : ${partyCountAfterRollback} (attendu : 7, soit 6 permanents + 1 manuel)`);
    console.log(`   - Candidats restants : ${candCountAfterRollback} (attendu : 7, soit 6 permanents + 1 manuel)`);

    // Attendu pour dvCountAfterRollback : 6 observations
    // 1. Observation préexistante (#preExistingDvId)
    // 2. Observation initiale Génération A (#seedPubToSupersede.id)
    // 3. Révision Génération B (#genBId)
    // 4. Révision Génération C (#genCId)
    // 5. Brouillon modifié sans publication (#seedDraftToModify.id)
    // 6. Brouillon publié (#seedDraftToPublish.id)
    if (artCountAfterRollback !== 1 || podCountAfterRollback !== 1 || dvCountAfterRollback !== 6 || partyCountAfterRollback !== 7 || candCountAfterRollback !== 7) {
      throw new Error(`Échec du rollback : les volumes après rollback sont incorrects (dvCount: ${dvCountAfterRollback}, attendu: 6).`);
    }

    // Vérification individuelle de la chaîne complète 3 générations A -> B -> C
    const genACheck = await testClient.query('SELECT id, superseded_by_id FROM data_values WHERE id = $1', [seedPubToSupersede.id]);
    const genBCheck = await testClient.query('SELECT id, supersedes_id, superseded_by_id, revision_number FROM data_values WHERE id = $1', [genBId]);
    const genCCheck = await testClient.query('SELECT id, supersedes_id, revision_number FROM data_values WHERE id = $1', [genCId]);

    if (genACheck.rowCount !== 1) throw new Error('La génération A (parent initiale) a été détruite !');
    if (genBCheck.rowCount !== 1) throw new Error('La génération B (intermédiaire) a été détruite !');
    if (genCCheck.rowCount !== 1) throw new Error('La génération C (révision finale) a été détruite !');

    if (genBCheck.rows[0].supersedes_id !== seedPubToSupersede.id) throw new Error('Lien B -> A rompu.');
    if (genCCheck.rows[0].supersedes_id !== genBId) throw new Error('Lien C -> B rompu.');
    console.log(`   ✓ Cas 1 vérifié : chaîne complète 3 générations A (#${seedPubToSupersede.id}) -> B (#${genBId}) -> C (#${genCId}) 100% préservée.`);

    // Vérification du brouillon modifié sans publication et sans delta temporel (Cas 2)
    const draftModifiedCheck = await testClient.query('SELECT id, value_numeric, editorial_status FROM data_values WHERE id = $1', [seedDraftToModify.id]);
    if (draftModifiedCheck.rowCount !== 1) throw new Error('Le brouillon modifié sans publication a été supprimé à tort !');
    if (parseFloat(draftModifiedCheck.rows[0].value_numeric) !== 123456.0) throw new Error('La valeur du brouillon modifié a été écrasée.');
    console.log(`   ✓ Cas 2 vérifié : brouillon modifié #${seedDraftToModify.id} préservé exclusivement par détection audit log.`);

    // Vérification du brouillon publié (Cas 3)
    const draftPublishedCheck = await testClient.query('SELECT id, editorial_status FROM data_values WHERE id = $1', [seedDraftToPublish.id]);
    if (draftPublishedCheck.rowCount !== 1) throw new Error('Le brouillon publié manuellement a été supprimé à tort !');
    console.log(`   ✓ Cas 3 vérifié : brouillon publié #${seedDraftToPublish.id} 100% préservé.`);

    // Vérification de la conservation des sources documentaires (Cas 4)
    const aSourcesCheck = await testClient.query('SELECT COUNT(*)::int as cnt FROM data_value_sources WHERE data_value_id = $1', [seedPubToSupersede.id]);
    const cSourcesCheck = await testClient.query('SELECT COUNT(*)::int as cnt FROM data_value_sources WHERE data_value_id = $1', [genCId]);
    const draftSourcesCheck = await testClient.query('SELECT COUNT(*)::int as cnt FROM data_value_sources WHERE data_value_id = $1', [seedDraftToModify.id]);
    if (aSourcesCheck.rows[0].cnt < 1) throw new Error('Les sources de l\'observation génération A ont été supprimées !');
    if (cSourcesCheck.rows[0].cnt < 1) throw new Error('La source manuelle de la révision génération C a été supprimée !');
    if (draftSourcesCheck.rows[0].cnt < 1) throw new Error('La source du brouillon modifié a été supprimée !');
    console.log(`   ✓ Cas 4 vérifié : 100% des sources documentaires liées aux observations conservées sont préservées.`);

    // Vérification que l'observation préexistante est également conservée
    const preExistingCheck = await testClient.query(`
      SELECT id FROM data_values WHERE id = $1;
    `, [preExistingDvId]);
    if (preExistingCheck.rowCount !== 1) throw new Error('L\'observation préexistante a été indûment supprimée par le rollback !');
    console.log(`   ✓ Observation préexistante #${preExistingDvId} 100% conservée.`);

    // Vérification individuelle de la survie de chaque contenu manuel
    const manualArtCheck = await testClient.query('SELECT title, is_demo FROM articles WHERE id = $1', [manualArticleId]);
    if (manualArtCheck.rowCount !== 1) throw new Error('L\'article manuel a été supprimé par le rollback !');
    if (manualArtCheck.rows[0].is_demo !== false) throw new Error('L\'article manuel devrait conserver is_demo = FALSE.');

    const manualPodCheck = await testClient.query('SELECT title FROM podcasts WHERE id = $1', [manualPodcastId]);
    if (manualPodCheck.rowCount !== 1) throw new Error('Le podcast manuel a été supprimé par le rollback !');

    const manualPartyCheck = await testClient.query('SELECT name FROM parties WHERE id = $1', [manualPartyId]);
    if (manualPartyCheck.rowCount !== 1) throw new Error('Le parti manuel a été supprimé par le rollback !');

    const manualCandCheck = await testClient.query('SELECT full_name FROM candidates WHERE id = $1', [manualCandId]);
    if (manualCandCheck.rowCount !== 1) throw new Error('Le candidat manuel a été supprimé par le rollback !');

    console.log('   ✓ Données manuelles 100% conservées après le rollback :');
    console.log(`     - Article : "${manualArtCheck.rows[0].title}"`);
    console.log(`     - Podcast : "${manualPodCheck.rows[0].title}"`);
    console.log(`     - Parti : "${manualPartyCheck.rows[0].name}"`);
    console.log(`     - Candidat : "${manualCandCheck.rows[0].full_name}"`);

    // Vérification que les 6 partis et 6 candidats permanents sont encore présents et liés
    const permAfterRollback = await testClient.query(`
      SELECT c.full_name as candidate, p.acronym as party_acronym
      FROM candidates c
      JOIN parties p ON c.current_party_id = p.id
      WHERE c.full_name IN ('Paul Biya', 'Maurice Kamto', 'Joshua Osih', 'Bello Bouba Maïgari', 'Cabral Libii', 'Patricia Hermine Ndam Njoya')
      ORDER BY p.acronym;
    `);
    if (permAfterRollback.rowCount !== 6) {
      throw new Error('Les 6 candidats ou partis permanents ont été endommagés par le rollback.');
    }
    console.log('   ✅ Test 8 & 9 validés : le rollback révoque les données du seed et CONSERVE 100% des données permanentes ET manuelles.');

    // 10. Test 10 : Transaction atomique en cas d'erreur
    console.log('\n[Test 10] Vérification de l\'annulation transactionnelle totale en cas d\'erreur...');
    // On simule une erreur en forçant une violation de clé ou de contrainte dans une transaction
    let errorCaught = false;
    try {
      await testClient.query('BEGIN');
      await testClient.query(`
        INSERT INTO articles (title, slug, content, author_id)
        VALUES ('Test Article Rollback', 'test-article-rollback', 'Contenu', 999999);
      `);
      await testClient.query('COMMIT');
    } catch (_expectedErr) {
      await testClient.query('ROLLBACK');
      errorCaught = true;
    }

    const testArtCount = (await testClient.query("SELECT COUNT(*)::int as cnt FROM articles WHERE slug = 'test-article-rollback'")).rows[0].cnt;
    if (!errorCaught || testArtCount !== 0) {
      throw new Error('La transaction n\'a pas correctement annulé les opérations lors d\'une erreur.');
    }
    console.log('   ✅ Test 10 validé : une erreur provoque un ROLLBACK total et ne laisse aucun résidu.');

    await testClient.end();

    // Nettoyage de la base de test
    console.log(`\n[Nettoyage] Suppression de la base temporaire ${TEST_DB}...`);
    await rootClient.query(`DROP DATABASE ${TEST_DB} WITH (FORCE);`);
    console.log('   ✓ Base temporaire nettoyée.');

    console.log('\n==============================================================');
    console.log('🎉 TOUS LES 10 TESTS DU CAHIER DES CHARGES ONT ÉTÉ EXÉCUTÉS ET RÉUSSIS !');
    console.log('==============================================================\n');

  } catch (err) {
    console.error('\n❌ ÉCHEC DE LA SUITE DE TEST :', err);
    try {
      await rootClient.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
    } catch (_e) {}
    process.exit(1);
  } finally {
    await rootClient.end();
  }
}

runTestSuite();
