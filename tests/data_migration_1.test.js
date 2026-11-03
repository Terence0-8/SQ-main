'use strict';

process.env.NODE_ENV = 'test';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../backend/config/database');

describe('SOLITIQUO DATA — MIGRATION 1 VALIDATION SUITE', () => {
  // ============================================================
  // 1. VÉRIFICATION DE LA PRÉSENCE DES 6 TABLES ET DES TABLES EXISTANTES
  // ============================================================
  test('Les 6 nouvelles tables et les tables existantes (users, parties) sont bien présentes', async () => {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN (
          'territories',
          'data_indicators',
          'data_sources',
          'candidates',
          'breakdown_dimensions',
          'breakdown_items',
          'users',
          'parties'
        );
    `);
    const foundTables = res.rows.map(r => r.table_name);
    const expectedTables = [
      'territories',
      'data_indicators',
      'data_sources',
      'candidates',
      'breakdown_dimensions',
      'breakdown_items',
      'users',
      'parties'
    ];

    for (const tbl of expectedTables) {
      assert.ok(foundTables.includes(tbl), `Table manquante: ${tbl}`);
    }
  });

  // ============================================================
  // 2. VÉRIFICATION DU RÉFÉRENTIEL INITIAL (CAMEROUN ET LES 10 RÉGIONS)
  // ============================================================
  test('Le référentiel initial des territoires contient le pays et les 10 régions officielles', async () => {
    const country = await pool.query("SELECT * FROM territories WHERE code = 'CMR'");
    assert.equal(country.rows.length, 1);
    assert.equal(country.rows[0].name, 'Cameroun');
    assert.equal(country.rows[0].type, 'country');
    assert.equal(country.rows[0].parent_id, null);

    const countryId = country.rows[0].id;

    const regions = await pool.query(
      "SELECT code, name, parent_id FROM territories WHERE type = 'region' ORDER BY code"
    );
    assert.equal(regions.rows.length, 10, 'Il doit y avoir exactement 10 régions');

    const expectedRegions = [
      { code: 'CM-AD', name: 'Adamaoua' },
      { code: 'CM-CE', name: 'Centre' },
      { code: 'CM-EN', name: 'Extrême-Nord' },
      { code: 'CM-ES', name: 'Est' },
      { code: 'CM-LT', name: 'Littoral' },
      { code: 'CM-NO', name: 'Nord' },
      { code: 'CM-NW', name: 'Nord-Ouest' },
      { code: 'CM-OU', name: 'Ouest' },
      { code: 'CM-SU', name: 'Sud' },
      { code: 'CM-SW', name: 'Sud-Ouest' }
    ];

    for (const exp of expectedRegions) {
      const match = regions.rows.find(r => r.code === exp.code);
      assert.ok(match, `Région ${exp.code} absente`);
      assert.equal(match.name, exp.name);
      assert.equal(match.parent_id, countryId);
    }
  });

  // ============================================================
  // 3. VÉRIFICATION DES DIMENSIONS INITIALES
  // ============================================================
  test('Les dimensions standard de ventilation sont initialisées', async () => {
    const dims = await pool.query('SELECT code, dimension_type FROM breakdown_dimensions ORDER BY code');
    const dimCodes = dims.rows.map(d => d.code);
    assert.ok(dimCodes.includes('POL_PARTY'));
    assert.ok(dimCodes.includes('CANDIDATE'));
    assert.ok(dimCodes.includes('ECO_SECTOR'));
    assert.ok(dimCodes.includes('DEMO_AGE_GROUP'));
    assert.ok(dimCodes.includes('GENDER'));
  });

  // ============================================================
  // 4. TEST DES CONTRAINTES D'UNICITÉ
  // ============================================================
  test('Contrainte d\'unicité sur territories.code', async () => {
    await assert.rejects(
      async () => {
        await pool.query(
          "INSERT INTO territories (code, name, type) VALUES ('CMR', 'Doublon Cameroun', 'country')"
        );
      },
      /unique|duplicate/i
    );
  });

  test('Contrainte d\'unicité sur breakdown_dimensions.code', async () => {
    await assert.rejects(
      async () => {
        await pool.query(
          "INSERT INTO breakdown_dimensions (code, label, dimension_type) VALUES ('POL_PARTY', 'Doublon', 'political_party')"
        );
      },
      /unique|duplicate/i
    );
  });

  test('Contrainte d\'unicité sur breakdown_items (dimension_id, code)', async () => {
    const dim = await pool.query("SELECT id FROM breakdown_dimensions WHERE code = 'ECO_SECTOR'");
    const dimId = dim.rows[0].id;

    // Premier insert : succès
    await pool.query(
      "INSERT INTO breakdown_items (dimension_id, code, label) VALUES ($1, 'TEST_CODE', 'Test Label') ON CONFLICT DO NOTHING",
      [dimId]
    );

    // Deuxième insert identique : échec d'unicité
    await assert.rejects(
      async () => {
        await pool.query(
          "INSERT INTO breakdown_items (dimension_id, code, label) VALUES ($1, 'TEST_CODE', 'Autre Label')",
          [dimId]
        );
      },
      /unique|duplicate/i
    );

    // Nettoyage
    await pool.query("DELETE FROM breakdown_items WHERE code = 'TEST_CODE'");
  });

  // ============================================================
  // 5. TEST DES CLÉS ÉTRANGÈRES ET RESTRICTIONS
  // ============================================================
  test('Clé étrangère candidates.current_party_id vers parties', async () => {
    const uniqueSuffix = Date.now();
    const partyName = `Parti Test Data ${uniqueSuffix}`;
    let partyId;
    let candidateId;

    try {
      // Insérer un parti de test temporaire
      const pRes = await pool.query(
        "INSERT INTO parties (name, acronym, color) VALUES ($1, 'PTD', '#123456') RETURNING id",
        [partyName]
      );
      partyId = pRes.rows[0].id;

      // Insérer un candidat lié à ce parti
      const cRes = await pool.query(
        "INSERT INTO candidates (full_name, current_party_id) VALUES ('Candidat Test', $1) RETURNING id",
        [partyId]
      );
      candidateId = cRes.rows[0].id;

      assert.ok(candidateId > 0);

      // Tenter de référencer un party_id inexistant : rejet FK
      await assert.rejects(
        async () => {
          await pool.query(
            "INSERT INTO candidates (full_name, current_party_id) VALUES ('Candidat Faux', 999999)"
          );
        },
        (err) => err.code === '23503' || /cl[eé]\s+[eé]trang[eè]re|foreign key/i.test(err.message)
      );

      // Test ON DELETE SET NULL sur candidates.current_party_id
      await pool.query("DELETE FROM parties WHERE id = $1", [partyId]);
      partyId = null; // Supprimé

      const updatedCandidate = await pool.query("SELECT current_party_id FROM candidates WHERE id = $1", [candidateId]);
      assert.equal(updatedCandidate.rows[0].current_party_id, null, 'Doit être passé à NULL grâce à ON DELETE SET NULL');
    } finally {
      if (candidateId) await pool.query("DELETE FROM candidates WHERE id = $1", [candidateId]);
      if (partyId) await pool.query("DELETE FROM parties WHERE id = $1", [partyId]);
    }
  });

  // ============================================================
  // 6. TEST DE L'INTÉGRITÉ DES DIMENSIONS (TRIGGER)
  // ============================================================
  test('Règle trigger : une dimension économique/démographique rejette party_id ou candidate_id', async () => {
    const dimEco = await pool.query("SELECT id FROM breakdown_dimensions WHERE code = 'ECO_SECTOR'");
    const dimEcoId = dimEco.rows[0].id;
    const uniqueSuffix = Date.now();
    let partyId;

    try {
      // Créer un parti temporaire
      const pRes = await pool.query(
        "INSERT INTO parties (name, acronym) VALUES ($1, 'PPT') RETURNING id",
        [`Parti Pour Trigger ${uniqueSuffix}`]
      );
      partyId = pRes.rows[0].id;

      // Tenter d'insérer un item sectoriel avec party_id -> DOIT ÉCHOUER
      await assert.rejects(
        async () => {
          await pool.query(
            "INSERT INTO breakdown_items (dimension_id, code, label, party_id) VALUES ($1, 'ECO_INVALID', 'Agri', $2)",
            [dimEcoId, partyId]
          );
        },
        /Les dimensions sectorielles ou démographiques ne peuvent référencer ni parti ni candidat/
      );
    } finally {
      if (partyId) await pool.query("DELETE FROM parties WHERE id = $1", [partyId]);
    }
  });

  test('Règle trigger : une dimension political_party exige party_id et refuse candidate_id', async () => {
    const dimPol = await pool.query("SELECT id FROM breakdown_dimensions WHERE code = 'POL_PARTY'");
    const dimPolId = dimPol.rows[0].id;
    const uniqueSuffix = Date.now();
    let partyId;
    let itemId;

    try {
      // Sans party_id -> DOIT ÉCHOUER
      await assert.rejects(
        async () => {
          await pool.query(
            "INSERT INTO breakdown_items (dimension_id, code, label) VALUES ($1, 'POL_INVALID', 'Sans Parti')",
            [dimPolId]
          );
        },
        /Item de dimension parti politique : party_id est obligatoire/
      );

      // Avec un parti valide -> DOIT RÉUSSIR
      const pRes = await pool.query(
        "INSERT INTO parties (name, acronym) VALUES ($1, 'PVI') RETURNING id",
        [`Parti Valide Item ${uniqueSuffix}`]
      );
      partyId = pRes.rows[0].id;

      const inserted = await pool.query(
        "INSERT INTO breakdown_items (dimension_id, code, label, party_id) VALUES ($1, $2, 'Parti Valide Item', $3) RETURNING id",
        [dimPolId, `PVI_${uniqueSuffix}`, partyId]
      );
      itemId = inserted.rows[0].id;
      assert.ok(itemId > 0);
    } finally {
      if (itemId) await pool.query("DELETE FROM breakdown_items WHERE id = $1", [itemId]);
      if (partyId) await pool.query("DELETE FROM parties WHERE id = $1", [partyId]);
    }
  });

  test('Règle trigger : une dimension electoral_candidate exige candidate_id', async () => {
    const dimCand = await pool.query("SELECT id FROM breakdown_dimensions WHERE code = 'CANDIDATE'");
    const dimCandId = dimCand.rows[0].id;

    // Sans candidate_id -> DOIT ÉCHOUER
    await assert.rejects(
      async () => {
        await pool.query(
          "INSERT INTO breakdown_items (dimension_id, code, label) VALUES ($1, 'CAND_INVALID', 'Sans Candidat')",
          [dimCandId]
        );
      },
      /Item de dimension candidat : candidate_id est obligatoire/
    );

    // Avec un candidat valide -> DOIT RÉUSSIR
    const cRes = await pool.query(
      "INSERT INTO candidates (full_name) VALUES ('Candidat Valide Item') RETURNING id"
    );
    const candidateId = cRes.rows[0].id;

    const inserted = await pool.query(
      "INSERT INTO breakdown_items (dimension_id, code, label, candidate_id) VALUES ($1, 'CAND_ITEM', 'Candidat Valide Item', $2) RETURNING id",
      [dimCandId, candidateId]
    );
    assert.ok(inserted.rows[0].id > 0);

    // Nettoyage
    await pool.query("DELETE FROM breakdown_items WHERE id = $1", [inserted.rows[0].id]);
    await pool.query("DELETE FROM candidates WHERE id = $1", [candidateId]);
  });

  // ============================================================
  // 7. INTÉGRITÉ DE USERS ET PARTIES
  // ============================================================
  test('Les tables existantes users et parties sont toujours intactes', async () => {
    const usersCount = await pool.query('SELECT count(*) FROM users');
    const partiesCount = await pool.query('SELECT count(*) FROM parties');
    assert.ok(parseInt(usersCount.rows[0].count, 10) >= 0);
    assert.ok(parseInt(partiesCount.rows[0].count, 10) >= 0);
  });

  after(async () => {
    await pool.end();
  });
});
