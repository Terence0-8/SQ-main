'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../server');
const pool = require('../backend/config/database');

describe('SOLITIQUO — TESTS DE L\'API DES PARTIS POLITIQUES (/api/parties)', () => {

  after(async () => {
    await pool.end();
  });

  test('1. GET /api/parties retourne HTTP 200 et la liste complète des 6 partis permanents', async () => {
    const res = await request(app)
      .get('/api/parties')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(typeof res.body.count, 'number');
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 6, 'Exactement 6 partis permanents attendus');

    const acronyms = res.body.data.map(p => p.acronym);
    assert.deepEqual(acronyms, ['RDPC', 'MRC', 'SDF', 'UNDP', 'PCRN', 'UDC']);

    // Vérifier les champs obligatoires du contrat d'API
    res.body.data.forEach(p => {
      assert.ok(p.id, `ID manquant pour ${p.acronym}`);
      assert.ok(p.name, `Nom manquant pour ${p.acronym}`);
      assert.ok(p.acronym, `Acronyme manquant pour ${p.name}`);
      assert.ok(p.description, `Description manquante pour ${p.acronym}`);
      assert.equal(p.is_active, true, `is_active doit être vrai pour ${p.acronym}`);
    });
  });

  test('2. GET /api/parties?active=true&lang=fr retourne les partis en français avec l\'UNDP', async () => {
    const res = await request(app)
      .get('/api/parties?active=true&lang=fr')
      .expect(200);

    assert.equal(res.body.success, true);
    const parties = res.body.data;
    assert.equal(parties.length, 6);

    const undp = parties.find(p => p.acronym === 'UNDP');
    assert.ok(undp, 'L\'UNDP doit être présent dans les résultats');
    assert.equal(undp.name, 'Union Nationale pour la Démocratie et le Progrès');
    assert.equal(undp.leader_name, 'Bello Bouba Maïgari');
    assert.equal(undp.seats_assembly, 7);
    assert.equal(undp.type, 'majorite');
    assert.equal(undp.founded_year, 1990);
    assert.equal(undp.creation_date, '1990');
    assert.equal(undp.is_active, true);
  });

  test('3. GET /api/parties?active=true&lang=en retourne les titres et descriptions traduits', async () => {
    const res = await request(app)
      .get('/api/parties?active=true&lang=en')
      .expect(200);

    assert.equal(res.body.success, true);
    const parties = res.body.data;

    const rdpc = parties.find(p => p.acronym === 'RDPC');
    assert.ok(rdpc);
    assert.equal(rdpc.name, 'Cameroon People\'s Democratic Rally');
    assert.equal(rdpc.seats_assembly, 152);
    assert.equal(rdpc.type, 'majorite');

    const mrc = parties.find(p => p.acronym === 'MRC');
    assert.ok(mrc);
    assert.equal(mrc.name, 'Cameroon Renaissance Movement');
    assert.equal(mrc.seats_assembly, 0);
    assert.equal(mrc.type, 'opposition');
  });

  test('4. GET /api/parties/:id retourne le détail conforme d\'un parti', async () => {
    // Récupérer la liste pour obtenir un ID valide
    const listRes = await request(app).get('/api/parties').expect(200);
    const firstParty = listRes.body.data[0];

    const detailRes = await request(app)
      .get(`/api/parties/${firstParty.id}`)
      .expect(200);

    assert.equal(detailRes.body.success, true);
    const party = detailRes.body.data;
    assert.equal(party.id, firstParty.id);
    assert.equal(party.acronym, firstParty.acronym);
    assert.equal(party.name, firstParty.name);
    assert.equal(party.seats_assembly, firstParty.seats_assembly);
    assert.equal(party.type, firstParty.type);
  });

  test('5. GET /api/parties/:id avec ID invalide ou inexistant renvoie 400 ou 404', async () => {
    await request(app)
      .get('/api/parties/invalid-id')
      .expect(400);

    await request(app)
      .get('/api/parties/999999')
      .expect(404);
  });
});

