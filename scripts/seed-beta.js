'use strict';

/**
 * =============================================================================
 * SOLITIQUO — SCRIPT D'INITIALISATION SÉCURISÉ & IDEMPOTENT (BÊTA RAILWAY)
 * =============================================================================
 * Rôle :
 * Injecte le jeu de données initial nécessaire au fonctionnement et à l'affichage
 * complet de Solitiquo en environnement de préproduction / bêta :
 * - Compte auteur système technique (redaction@solitiquo.com) avec mot de passe inexploitable
 * - Conservation / garantie absolue des 6 partis et 6 candidats permanents du projet
 * - 167 partis politiques du Cameroun
 * - 160 candidats associés
 * - 14 podcasts (dont 1 podcast mis à la une)
 * - 4 émissions vidéo
 * - 80 articles rédigés et vérifiés
 * - 2 sondages d'opinion
 * - 28 observations statistiques DATA (4 publiées + 24 brouillons de cadrage)
 * - 28 sources documentaires associées
 *
 * Propriétés :
 * - Idempotence stricte : aucune duplication en cas d'exécutions répétées.
 * - Intégrité transactionnelle : BEGIN ... COMMIT avec ROLLBACK total en cas d'erreur.
 * - Traçabilité explicite : table de journalisation `_seed_beta_log` pour retour arrière ciblé.
 * - Sanctuaire des permanents : les 6 partis et 6 candidats permanents ne sont jamais écrasés ni supprimés.
 * - Sécurité : aucun compte personnel, mot de passe réel, token ou secret de dév n'est importé.
 * =============================================================================
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../backend/config/database');

const SEEDS_DIR = path.join(__dirname, '../backend/data/seeds');

// -----------------------------------------------------------------------------
// RÉFÉRENTIELS PERMANENTS DU PROJET SOLITIQUO (6 PARTIS & 6 CANDIDATS)
// -----------------------------------------------------------------------------
const PERMANENT_PARTIES = [
  {
    name: 'Rassemblement Démocratique du Peuple Camerounais',
    acronym: 'RDPC',
    founded_year: 1985,
    leader_name: 'Paul Biya',
    color: '#37463D',
    description: "Fondé en 1985 à Bamenda, le Rassemblement Démocratique du Peuple Camerounais (RDPC) est le parti au pouvoir. Il détient la majorité absolue à l'Assemblée nationale (152 députés sur 180 lors de la 10e Législature) et promeut le renforcement de l'unité nationale et l'émergence économique.",
    title_en: "Cameroon People's Democratic Rally",
    description_en: 'Founded in 1985 in Bamenda, the CPDM is the ruling party holding the absolute majority in the National Assembly (152 out of 180 seats in the 10th Legislature).',
    slug_en: 'rdpc-en'
  },
  {
    name: 'Mouvement pour la Renaissance du Cameroun',
    acronym: 'MRC',
    founded_year: 2012,
    leader_name: 'Maurice Kamto',
    color: '#C82823',
    description: "Fondé en 2012 par le Pr. Maurice Kamto, le Mouvement pour la Renaissance du Cameroun (MRC) est l'un des principaux partis d'opposition du pays. Non représenté à l'Assemblée nationale suite à sa décision de boycott des élections législatives de 2020, il milite pour la réforme électorale et l'alternance démocratique.",
    title_en: 'Cameroon Renaissance Movement',
    description_en: 'Founded in 2012 by Pr. Maurice Kamto, the MRC is a prominent opposition movement. Not represented in the current legislature following the 2020 boycott, it advocates for electoral reform.',
    slug_en: 'mrc-en'
  },
  {
    name: 'Social Democratic Front',
    acronym: 'SDF',
    founded_year: 1990,
    leader_name: 'Joshua Osih',
    color: '#D4AF37',
    description: "Fondé en 1990 à Bamenda par Ni John Fru Ndi, le Social Democratic Front (SDF) est une formation historique de l'opposition parlementaire camerounaise. Présidé par Joshua Osih, il détient 5 sièges à l'Assemblée nationale (10e Législature).",
    title_en: 'Social Democratic Front',
    description_en: 'Historic opposition party founded in 1990 in Bamenda. Chaired by Joshua Osih, holding 5 seats in the National Assembly (10th Legislature).',
    slug_en: 'sdf-en'
  },
  {
    name: 'Union Nationale pour la Démocratie et le Progrès',
    acronym: 'UNDP',
    founded_year: 1990,
    leader_name: 'Bello Bouba Maïgari',
    color: '#059669',
    description: "Créée en 1990, l'Union Nationale pour la Démocratie et le Progrès (UNDP) est alliée à la majorité gouvernementale. Elle compte 7 députés à l'Assemblée nationale au cours de la 10e Législature et s'investit pour le développement territorial et la décentralisation.",
    title_en: 'National Union for Democracy and Progress',
    description_en: 'Formed in 1990, the UNDP is part of the government alliance and holds 7 seats in the National Assembly (10th Legislature).',
    slug_en: 'undp-en'
  },
  {
    name: 'Parti Camerounais pour la Réconciliation Nationale',
    acronym: 'PCRN',
    founded_year: 2003,
    leader_name: 'Cabral Libii',
    color: '#2563EB',
    description: "Dirigé par Cabral Libii, le Parti Camerounais pour la Réconciliation Nationale (PCRN) est représenté par 5 députés à l'Assemblée nationale (10e Législature). Il défend le renouvellement des politiques publiques, la protection sociale et la moralisation citoyenne.",
    title_en: 'Cameroon Party for National Reconciliation',
    description_en: 'Led by Cabral Libii, the PCRN represents a new generation of political engagement with 5 seats in the National Assembly (10th Legislature).',
    slug_en: 'pcrn-en'
  },
  {
    name: 'Union Démocratique du Cameroun',
    acronym: 'UDC',
    founded_year: 1991,
    leader_name: 'Patricia Hermine Ndam Njoya',
    color: '#7C3AED',
    description: "Fondée en 1991 par le Dr. Adamou Ndam Njoya et aujourd'hui présidée par Patricia Hermine Ndam Njoya, l'Union Démocratique du Cameroun (UDC) compte 4 députés à l'Assemblée nationale (10e Législature) et porte des valeurs d'éthique politique et de décentralisation.",
    title_en: 'Cameroon Democratic Union',
    description_en: 'Founded in 1991 by Dr. Adamou Ndam Njoya, the UDC holds 4 seats in the National Assembly (10th Legislature).',
    slug_en: 'udc-en'
  }
];

const PERMANENT_CANDIDATES = [
  {
    full_name: 'Paul Biya',
    first_name: 'Paul',
    last_name: 'Biya',
    party_acronym: 'RDPC',
    party_name: 'Rassemblement Démocratique du Peuple Camerounais',
    bio: "Président national du RDPC et Chef de l'État du Cameroun."
  },
  {
    full_name: 'Maurice Kamto',
    first_name: 'Maurice',
    last_name: 'Kamto',
    party_acronym: 'MRC',
    party_name: 'Mouvement pour la Renaissance du Cameroun',
    bio: 'Président national du MRC, juriste et universitaire de renommée internationale.'
  },
  {
    full_name: 'Joshua Osih',
    first_name: 'Joshua',
    last_name: 'Osih',
    party_acronym: 'SDF',
    party_name: 'Social Democratic Front',
    bio: "Président national du Social Democratic Front (SDF) et député à l'Assemblée nationale."
  },
  {
    full_name: 'Bello Bouba Maïgari',
    first_name: 'Bello Bouba',
    last_name: 'Maïgari',
    party_acronym: 'UNDP',
    party_name: 'Union Nationale pour la Démocratie et le Progrès',
    bio: "Président national de l'UNDP et ministre d'État."
  },
  {
    full_name: 'Cabral Libii',
    first_name: 'Cabral',
    last_name: 'Libii',
    party_acronym: 'PCRN',
    party_name: 'Parti Camerounais pour la Réconciliation Nationale',
    bio: "Président national du PCRN, juriste et député à l'Assemblée nationale."
  },
  {
    full_name: 'Patricia Hermine Ndam Njoya',
    first_name: 'Patricia Hermine',
    last_name: 'Ndam Njoya',
    party_acronym: 'UDC',
    party_name: 'Union Démocratique du Cameroun',
    bio: "Présidente nationale de l'UDC, maire de Foumban et ancienne députée."
  }
];

function loadSeedData(fileName) {
  const filePath = path.join(SEEDS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Fichier de seed introuvable : ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function runSeed() {
  console.log('\n🌱 ==============================================================');
  console.log('   SOLITIQUO : INITIALISATION DES DONNÉES DE BÊTA (SÉCURISÉE)');
  console.log('   ==============================================================\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // -------------------------------------------------------------------------
    // 0. Table de traçabilité explicite (_seed_beta_log)
    // -------------------------------------------------------------------------
    await client.query(`
      CREATE TABLE IF NOT EXISTS _seed_beta_log (
        id SERIAL PRIMARY KEY,
        table_name VARCHAR(60) NOT NULL,
        record_id INTEGER NOT NULL,
        business_key TEXT,
        is_permanent BOOLEAN DEFAULT FALSE,
        seeded_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT uq_seed_beta_record UNIQUE (table_name, record_id)
      );
    `);

    async function logSeed(tableName, recordId, businessKey, isPermanent = false) {
      await client.query(`
        INSERT INTO _seed_beta_log (table_name, record_id, business_key, is_permanent)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (table_name, record_id) DO NOTHING;
      `, [tableName, recordId, businessKey, isPermanent]);
    }

    // -------------------------------------------------------------------------
    // 1. Compte système rédactionnel technique
    // -------------------------------------------------------------------------
    console.log('1️⃣  Garantie du compte auteur système (redaction@solitiquo.com)...');
    // Mot de passe non utilisable : préfixé d'un marqueur rendant toute comparaison impossible
    const unusableHash = '!UNUSABLE_SEED_AUTH_' + crypto.randomBytes(32).toString('hex');
    const userRes = await client.query(`
      INSERT INTO users (username, email, password, role, is_active)
      VALUES ('redaction_solitiquo', 'redaction@solitiquo.com', $1, 'writer', TRUE)
      ON CONFLICT (email) DO NOTHING
      RETURNING id;
    `, [unusableHash]);

    let systemAuthorId;
    if (userRes.rowCount > 0) {
      systemAuthorId = userRes.rows[0].id;
      await logSeed('users', systemAuthorId, 'redaction@solitiquo.com', false);
      console.log(`   ✓ Compte technique créé (ID: ${systemAuthorId}).`);
    } else {
      const existingUser = await client.query(`SELECT id FROM users WHERE email = 'redaction@solitiquo.com' LIMIT 1;`);
      systemAuthorId = existingUser.rows[0].id;
      console.log(`   ✓ Compte technique déjà existant (ID: ${systemAuthorId}).`);
    }

    // -------------------------------------------------------------------------
    // 2. Garantie des 6 partis permanents
    // -------------------------------------------------------------------------
    console.log('\n2️⃣  Garantie des 6 partis politiques permanents du projet...');
    let permPartiesInserted = 0;
    for (const p of PERMANENT_PARTIES) {
      const res = await client.query(`
        INSERT INTO parties (
          name, acronym, logo_url, color, founded_year, leader_name, ideology,
          description, program_summary, website_url, contact_email, is_active,
          title_en, description_en, slug_en
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, $12, $13, $14)
        ON CONFLICT (name) DO NOTHING
        RETURNING id;
      `, [
        p.name, p.acronym, p.logo_url || null, p.color, p.founded_year, p.leader_name,
        p.ideology || null, p.description, p.program_summary || null, p.website_url || null,
        p.contact_email || null, p.title_en || null, p.description_en || null, p.slug_en || null
      ]);

      if (res.rowCount > 0) {
        permPartiesInserted++;
        await logSeed('parties', res.rows[0].id, p.acronym, true);
      }
    }
    console.log(`   ✓ Partis permanents : ${permPartiesInserted} inséré(s), ${PERMANENT_PARTIES.length - permPartiesInserted} déjà présent(s).`);

    // -------------------------------------------------------------------------
    // 3. Garantie des 6 candidats permanents
    // -------------------------------------------------------------------------
    console.log('\n3️⃣  Garantie des 6 candidats permanents (affiliations vérifiées)...');
    let permCandInserted = 0;
    for (const c of PERMANENT_CANDIDATES) {
      const res = await client.query(`
        INSERT INTO candidates (
          full_name, first_name, last_name, bio, current_party_id, is_active
        )
        SELECT $1::varchar, $2::varchar, $3::varchar, $4::text,
               (SELECT id FROM parties WHERE acronym = $5::varchar OR name = $6::varchar LIMIT 1),
               TRUE
        WHERE NOT EXISTS (
          SELECT 1 FROM candidates WHERE full_name = $1::varchar
        )
        RETURNING id;
      `, [c.full_name, c.first_name, c.last_name, c.bio, c.party_acronym, c.party_name]);

      if (res.rowCount > 0) {
        permCandInserted++;
        await logSeed('candidates', res.rows[0].id, c.full_name, true);
      }
    }
    console.log(`   ✓ Candidats permanents : ${permCandInserted} inséré(s), ${PERMANENT_CANDIDATES.length - permCandInserted} déjà présent(s).`);

    // -------------------------------------------------------------------------
    // 4. Partis politiques du seed (6 références permanentes exclusivement)
    // -------------------------------------------------------------------------
    const permPartyAcronyms = PERMANENT_PARTIES.map(p => p.acronym);
    const parties = loadSeedData('parties.json').filter(p => permPartyAcronyms.includes(p.acronym) || PERMANENT_PARTIES.some(perm => perm.name === p.name));
    console.log(`\n4️⃣  Traitement des partis politiques du seed (${parties.length} références permanentes)...`);
    let partiesInserted = 0;

    for (const p of parties) {
      const res = await client.query(`
        INSERT INTO parties (
          name, acronym, logo_url, color, founded_year, leader_name, ideology,
          description, program_summary, website_url, contact_email, is_active,
          title_en, description_en, slug_en
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (name) DO NOTHING
        RETURNING id;
      `, [
        p.name, p.acronym, p.logo_url, p.color, p.founded_year, p.leader_name, p.ideology,
        p.description, p.program_summary, p.website_url, p.contact_email, p.is_active ?? true,
        p.title_en, p.description_en, p.slug_en
      ]);

      if (res.rowCount > 0) {
        partiesInserted++;
        await logSeed('parties', res.rows[0].id, p.name, true);
      }
    }
    console.log(`   ✓ Partis : ${partiesInserted} inséré(s) (${parties.length - partiesInserted} déjà existant(s)).`);

    // -------------------------------------------------------------------------
    // 5. Candidats du seed (6 références permanentes exclusivement)
    // -------------------------------------------------------------------------
    const permCandidateNames = PERMANENT_CANDIDATES.map(c => c.full_name);
    const candidates = loadSeedData('candidates.json').filter(c => permCandidateNames.includes(c.full_name));
    console.log(`\n5️⃣  Traitement des candidats du seed (${candidates.length} références permanentes)...`);
    let candInserted = 0;

    for (const c of candidates) {
      const res = await client.query(`
        INSERT INTO candidates (
          full_name, first_name, last_name, bio, photo_url, current_party_id, is_active
        )
        SELECT $1::varchar, $2::varchar, $3::varchar, $4::text, $5::text,
               (SELECT id FROM parties WHERE (acronym IS NOT NULL AND acronym = $6::varchar) OR name = $7::varchar LIMIT 1),
               $8::boolean
        WHERE NOT EXISTS (
          SELECT 1 FROM candidates WHERE full_name = $1::varchar
        )
        RETURNING id;
      `, [
        c.full_name, c.first_name, c.last_name, c.bio, c.photo_url,
        c.party_acronym, c.party_name, c.is_active ?? true
      ]);

      if (res.rowCount > 0) {
        candInserted++;
        await logSeed('candidates', res.rows[0].id, c.full_name, true);
      }
    }
    console.log(`   ✓ Candidats : ${candInserted} inséré(s) (${candidates.length - candInserted} déjà existant(s)).`);

    // -------------------------------------------------------------------------
    // 6. Podcasts (14 entrées)
    // -------------------------------------------------------------------------
    const podcasts = loadSeedData('podcasts.json');
    console.log(`\n6️⃣  Traitement des podcasts (${podcasts.length} entrées)...`);
    let podInserted = 0;

    for (const pod of podcasts) {
      const res = await client.query(`
        INSERT INTO podcasts (
          title, slug, description, audio_url, duration_seconds, cover_image,
          author_id, category, tags, status, is_premium, play_count, published_at,
          title_en, description_en, audio_url_en, slug_en, is_featured,
          is_featured_politique, is_featured_social
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (slug) DO NOTHING
        RETURNING id;
      `, [
        pod.title, pod.slug, pod.description, pod.audio_url, pod.duration_seconds, pod.cover_image,
        systemAuthorId, pod.category, pod.tags, pod.status || 'published', pod.is_premium || false,
        pod.play_count || 0, pod.published_at || new Date(),
        pod.title_en, pod.description_en, pod.audio_url_en, pod.slug_en,
        pod.is_featured || false, pod.is_featured_politique || false, pod.is_featured_social || false
      ]);

      if (res.rowCount > 0) {
        podInserted++;
        await logSeed('podcasts', res.rows[0].id, pod.slug, false);
      }
    }
    console.log(`   ✓ Podcasts : ${podInserted} inséré(s) (${podcasts.length - podInserted} déjà existant(s)).`);

    // -------------------------------------------------------------------------
    // 7. Émissions vidéo (4 entrées)
    // -------------------------------------------------------------------------
    const emissions = loadSeedData('emissions.json');
    console.log(`\n7️⃣  Traitement des émissions vidéo (${emissions.length} entrées)...`);
    let emInserted = 0;

    for (const em of emissions) {
      const res = await client.query(`
        INSERT INTO emissions (
          title, slug, description, video_url, thumbnail_url, duration_seconds,
          host_id, status, is_premium, view_count, aired_at, category,
          title_en, description_en, slug_en
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (slug) DO NOTHING
        RETURNING id;
      `, [
        em.title, em.slug, em.description, em.video_url, em.thumbnail_url, em.duration_seconds,
        systemAuthorId, em.status || 'published', em.is_premium || false, em.view_count || 0,
        em.aired_at || new Date(), em.category, em.title_en, em.description_en, em.slug_en
      ]);

      if (res.rowCount > 0) {
        emInserted++;
        await logSeed('emissions', res.rows[0].id, em.slug, false);
      }
    }
    console.log(`   ✓ Émissions : ${emInserted} insérée(s) (${emissions.length - emInserted} déjà existante(s)).`);

    // -------------------------------------------------------------------------
    // 8. Articles (80 entrées)
    // -------------------------------------------------------------------------
    const articles = loadSeedData('articles.json');
    console.log(`\n8️⃣  Traitement des articles (${articles.length} entrées)...`);
    let artInserted = 0;

    for (const art of articles) {
      const res = await client.query(`
        INSERT INTO articles (
          title, slug, content, excerpt, featured_image, author_id, category, tags,
          status, is_premium, language, views_count, published_at, title_en,
          content_en, excerpt_en, slug_en, read_time, reads_start, reads_25,
          reads_50, reads_75, reads_100, is_demo
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
        ON CONFLICT (slug) DO NOTHING
        RETURNING id;
      `, [
        art.title, art.slug, art.content, art.excerpt, art.featured_image, systemAuthorId,
        art.category, art.tags, art.status || 'published', art.is_premium || false,
        art.language || 'fr', art.views_count || 0, art.published_at || new Date(),
        art.title_en, art.content_en, art.excerpt_en, art.slug_en, art.read_time || 3,
        art.reads_start || 0, art.reads_25 || 0, art.reads_50 || 0, art.reads_75 || 0, art.reads_100 || 0,
        art.is_demo ?? true
      ]);

      if (res.rowCount > 0) {
        artInserted++;
        await logSeed('articles', res.rows[0].id, art.slug, false);
      }
    }
    console.log(`   ✓ Articles : ${artInserted} inséré(s) (${articles.length - artInserted} déjà existant(s)).`);

    // -------------------------------------------------------------------------
    // 9. Sondages (2 entrées)
    // -------------------------------------------------------------------------
    const polls = loadSeedData('polls.json');
    console.log(`\n9️⃣  Traitement des sondages (${polls.length} entrées)...`);
    let pollsInserted = 0;

    for (const poll of polls) {
      const res = await client.query(`
        INSERT INTO polls (
          question, options, created_by, is_active, ends_at, category, question_en
        )
        SELECT $1::varchar, $2::jsonb, $3::integer, $4::boolean, $5::timestamp, $6::varchar, $7::varchar
        WHERE NOT EXISTS (
          SELECT 1 FROM polls WHERE question = $1::varchar
        )
        RETURNING id;
      `, [
        poll.question,
        typeof poll.options === 'string' ? poll.options : JSON.stringify(poll.options),
        systemAuthorId, poll.is_active ?? true, poll.ends_at, poll.category, poll.question_en
      ]);

      if (res.rowCount > 0) {
        pollsInserted++;
        await logSeed('polls', res.rows[0].id, poll.question, false);
      }
    }
    console.log(`   ✓ Sondages : ${pollsInserted} inséré(s) (${polls.length - pollsInserted} déjà existant(s)).`);

    // -------------------------------------------------------------------------
    // 10. Observations statistiques (DATA : 4 publiées + 24 brouillons)
    // -------------------------------------------------------------------------
    // Garantie de la présence des indicateurs historiques clés (DEMO_POP_TOT, ELEC_REGISTERED)
    await client.query(`
      INSERT INTO data_indicators (code, name, description, category, unit, is_active, expected_periodicity)
      VALUES 
        ('DEMO_POP_TOT', 'Population totale du Cameroun', 'Effectif global de la population résidente sur le territoire national estimé par l''INS', 'demographie', 'habitants', TRUE, 'ANNUAL'),
        ('ELEC_REGISTERED', 'Électeurs inscrits sur les listes électorales', 'Citoyens camerounais biométriquement enregistrés par ELECAM pour les scrutins nationaux', 'politique', 'inscrits', TRUE, 'ANNUAL')
      ON CONFLICT (code) DO NOTHING;
    `);

    const dataValues = loadSeedData('data_values.json');
    const dataSources = loadSeedData('data_value_sources.json');
    console.log(`\n🔟 Traitement des observations DATA (${dataValues.length} entrées)...`);
    let dvInserted = 0;

    for (const dv of dataValues) {
      const res = await client.query(`
        INSERT INTO data_values (
          indicator_id, territory_id, period_type, period_start, period_end,
          value_numeric, value_text, methodology_nature, editorial_status, is_active,
          revision_number, public_reason_summary, internal_notes, methodology_notes,
          created_by, audit_status, audit_caveat, survey_or_account_status,
          school_year, audit_decision, audit_evidence_reference
        )
        SELECT 
          di.id,
          t.id,
          $3::varchar, $4::date, $5::date, $6::numeric, $7::text, $8::varchar, $9::varchar, $10::boolean, $11::integer, $12::text, $13::text, $14::text, $15::integer, $16::varchar, $17::text, $18::varchar, $19::varchar, $20::varchar, $21::text
        FROM data_indicators di, territories t
        WHERE di.code = $1::varchar AND t.code = $2::varchar
          AND NOT EXISTS (
            SELECT 1 FROM data_values existing
            WHERE existing.indicator_id = di.id
              AND existing.territory_id = t.id
              AND existing.period_type = $3::varchar
              AND existing.period_start = $4::date
          )
        RETURNING id;
      `, [
        dv.indicator_code, dv.territory_code, dv.period_type, dv.period_start, dv.period_end,
        dv.value_numeric, dv.value_text, dv.methodology_nature, dv.editorial_status, dv.is_active,
        dv.revision_number || 1, dv.public_reason_summary, dv.internal_notes, dv.methodology_notes,
        systemAuthorId, dv.audit_status, dv.audit_caveat, dv.survey_or_account_status,
        dv.school_year, dv.audit_decision || 'pending', dv.audit_evidence_reference
      ]);

      if (res.rowCount > 0) {
        dvInserted++;
        const dvId = res.rows[0].id;
        const businessKey = `${dv.indicator_code}_${dv.territory_code}_${dv.period_type}_${dv.period_start}`;
        await logSeed('data_values', dvId, businessKey, false);

        // Traçabilité fine des versions initiales créées lors du seed (via le trigger de publication fn_create_data_value_version_snapshot)
        const versionRes = await client.query(`
          SELECT id, revision_number FROM data_value_versions
          WHERE data_value_id = $1;
        `, [dvId]);
        for (const vRow of versionRes.rows) {
          await logSeed('data_value_versions', vRow.id, `${businessKey}_v${vRow.revision_number}`, false);
        }
      }
    }

    // Garantie de traçabilité des versions initiales pour toutes les observations du seed (y compris lors de ré-exécutions idempotentes)
    const initialVersions = await client.query(`
      SELECT dvv.id, dvv.data_value_id, dvv.revision_number, sbl.business_key
      FROM data_value_versions dvv
      JOIN _seed_beta_log sbl ON sbl.table_name = 'data_values' AND sbl.record_id = dvv.data_value_id
      WHERE dvv.revision_number = 1
        AND NOT EXISTS (
          SELECT 1 FROM _seed_beta_log existing
          WHERE existing.table_name = 'data_value_versions' AND existing.record_id = dvv.id
        );
    `);
    for (const vRow of initialVersions.rows) {
      await logSeed('data_value_versions', vRow.id, `${vRow.business_key}_v${vRow.revision_number}`, false);
    }
    console.log(`   ✓ Observations : ${dvInserted} insérée(s) (${dataValues.length - dvInserted} déjà existante(s)).`);

    // Rattachement des sources documentaires (28 entrées)
    // Sécurité stricte :
    // - Uniquement aux observations créées par le seed (garanti par JOIN sur _seed_beta_log)
    // - Correspondance exacte sur l'indicateur, le territoire et la période
    // - Jamais rattaché à une observation préexistante non créée par le seed
    let sourcesLinked = 0;
    for (const s of dataSources) {
      const territoryCode = s.territory_code || 'CMR';
      const periodType = s.period_type || 'ANNUAL';
      const periodEnd = s.period_end || `${s.period_start.substring(0, 4)}-12-31`;

      const res = await client.query(`
        INSERT INTO data_value_sources (
          data_value_id, source_id, source_role, documentary_tier,
          citation_reference, citation_url, methodological_robustness, notes, created_by
        )
        SELECT 
          dv.id,
          ds.id,
          $6::varchar, $7::varchar, $8::text, $9::text, $10::varchar, $11::text, $12::integer
        FROM data_values dv
        JOIN data_indicators di ON di.id = dv.indicator_id
        JOIN territories t ON t.id = dv.territory_id
        JOIN _seed_beta_log sbl ON sbl.table_name = 'data_values' AND sbl.record_id = dv.id
        JOIN data_sources ds ON ds.acronym = $5::varchar
        WHERE di.code = $1::varchar 
          AND t.code = $2::varchar
          AND dv.period_type = $3::varchar
          AND dv.period_start = $4::date
          AND dv.period_end = $13::date
          AND NOT EXISTS (
            SELECT 1 FROM data_value_sources existing
            WHERE existing.data_value_id = dv.id
              AND existing.source_id = ds.id
              AND existing.source_role = $6::varchar
          )
        RETURNING id;
      `, [
        s.indicator_code, territoryCode, periodType, s.period_start,
        s.source_acronym, s.source_role, s.documentary_tier, s.citation_reference,
        s.citation_url, s.methodological_robustness, s.notes, systemAuthorId,
        periodEnd
      ]);

      if (res.rowCount > 0) {
        sourcesLinked++;
        const businessKey = `${s.indicator_code}_${territoryCode}_${periodType}_${s.period_start}_${s.source_acronym}_${s.source_role}`;
        await logSeed('data_value_sources', res.rows[0].id, businessKey, false);
      }
    }
    console.log(`   ✓ Sources rattachées : ${sourcesLinked} liaison(s) créée(s) (${dataSources.length - sourcesLinked} déjà existante(s)).`);

    await client.query('COMMIT');
    console.log('\n🎉 ==============================================================');
    console.log('   IMPORT BÊTA ACHEVÉ AVEC SUCCÈS (TRANSACTION VALIDÉE & SCELLÉE)');
    console.log('   ==============================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERREUR DURANT L\'IMPORTATION (TRANSACTION INTÉGRALEMENT ANNULÉE) :', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runSeed().catch(() => process.exit(1));
