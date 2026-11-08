'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../backend/config/database');
const { getAdminValueById } = require('../backend/services/dataAdminService');

test('LOT 3E.3.4 — RÉCONCILIATION FORENSIQUE DES 13 OBSERVATIONS DE LA VAGUE 1', async (t) => {
  const ids = [693, 694, 695, 696, 698, 699, 700, 701, 706, 707, 708, 709, 710];

  const expectedValues = {
    693: { val: 21829, code: 'ECO_PIB_NOM', unit: 'milliards_fcfa' },
    694: { val: 22925.2, code: 'ECO_PIB_NOM', unit: 'milliards_fcfa' },
    695: { val: 22935.6, code: 'ECO_PIB_NOM', unit: 'milliards_fcfa' },
    696: { val: 25244.1, code: 'ECO_PIB_NOM', unit: 'milliards_fcfa' },
    698: { val: 4.0, code: 'ECO_PIB_GROWTH', unit: 'pourcentage' },
    699: { val: 3.4, code: 'ECO_PIB_GROWTH', unit: 'pourcentage' },
    700: { val: 0.5, code: 'ECO_PIB_GROWTH', unit: 'pourcentage' },
    701: { val: 3.6, code: 'ECO_PIB_GROWTH', unit: 'pourcentage' },
    706: { val: 106.8, code: 'EDU_PRIM_GROSS', unit: 'pourcentage' },
    707: { val: 105.2, code: 'EDU_PRIM_GROSS', unit: 'pourcentage' },
    708: { val: 104.1, code: 'EDU_PRIM_GROSS', unit: 'pourcentage' },
    709: { val: 105.7, code: 'EDU_PRIM_GROSS', unit: 'pourcentage' },
    710: { val: 107.3, code: 'EDU_PRIM_GROSS', unit: 'pourcentage' }
  };

  await t.test('1. Extraction directe et conformité des 13 valeurs en base', async () => {
    for (const id of ids) {
      const val = await getAdminValueById(id);
      assert.ok(val, `L'observation #${id} doit exister`);
      assert.equal(val.indicator_code, expectedValues[id].code);
      assert.equal(val.indicator_unit, expectedValues[id].unit);
      assert.equal(Number(val.value_numeric), expectedValues[id].val);
      assert.equal(val.editorial_status, 'draft');
      assert.equal(val.is_active, false);
      assert.equal(val.audit_decision, 'pending');
      assert.equal(val.audit_status, 'confirmed');
    }
  });

  await t.test('2. Traçabilité CREATE : concordance initiale dans data_value_audit_log', async () => {
    const res = await pool.query(`
      SELECT data_value_id, action, diff_payload, performed_at
      FROM data_value_audit_log
      WHERE data_value_id = ANY($1::bigint[]) AND action = 'CREATE'
      ORDER BY data_value_id ASC
    `, [ids]);

    assert.equal(res.rows.length, 13, 'Les 13 observations doivent avoir un événement CREATE');
    for (const row of res.rows) {
      const id = Number(row.data_value_id);
      assert.equal(Number(row.diff_payload.value_numeric), expectedValues[id].val,
        `La valeur initiale de CREATE pour #${id} doit correspondre exactement à la base`
      );
    }
  });

  await t.test('3. Traçabilité UPDATE_DRAFT : absence de mutation sur value_numeric', async () => {
    const res = await pool.query(`
      SELECT data_value_id, action, diff_payload
      FROM data_value_audit_log
      WHERE data_value_id = ANY($1::bigint[]) AND action = 'UPDATE_DRAFT'
    `, [ids]);

    for (const row of res.rows) {
      const diff = row.diff_payload || {};
      assert.equal(diff.value_numeric, undefined,
        `Aucun UPDATE_DRAFT ne doit avoir modifié value_numeric pour #${row.data_value_id}`
      );
    }
  });

  await t.test('4. Immutabilité des versions : aucune entrée dans data_value_versions (statut draft)', async () => {
    const res = await pool.query(`
      SELECT COUNT(*) as count
      FROM data_value_versions
      WHERE data_value_id = ANY($1::bigint[])
    `, [ids]);
    assert.equal(Number(res.rows[0].count), 0, 'data_value_versions doit être vide pour les 13 brouillons');
  });

  await t.test('5. Qualification des sources primaires et orientation pending_evidence', async () => {
    for (const id of ids) {
      const val = await getAdminValueById(id);
      assert.ok(val.sources && val.sources.length >= 1, `Au moins une source pour #${id}`);
      const primSource = val.sources.find(s => s.source_role === 'primary');
      assert.ok(primSource, `Une source primaire requise pour #${id}`);
      assert.ok(primSource.citation_reference && primSource.citation_reference.length >= 10);
      assert.equal(val.evidence_evaluation.proposed_decision, 'pending_evidence',
        `L'orientation d'arbitrage de #${id} doit être pending_evidence`
      );
    }
  });

  await t.test('6. Sanctuarisation absolue : 24 observations pilotes et #261', async () => {
    const checkRes = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE id BETWEEN 687 AND 710) as total_pilots,
        COUNT(*) FILTER (WHERE id BETWEEN 687 AND 710 AND editorial_status = 'draft') as draft_pilots,
        COUNT(*) FILTER (WHERE id BETWEEN 687 AND 710 AND is_active = false) as inactive_pilots,
        COUNT(*) FILTER (WHERE id BETWEEN 687 AND 710 AND audit_decision = 'pending') as pending_decision_pilots,
        COUNT(*) FILTER (WHERE id = 261 AND editorial_status = 'published' AND is_active = true) as obs_261_published,
        (SELECT value_numeric FROM data_values WHERE id = 261) as obs_261_value
      FROM data_values
    `);

    const r = checkRes.rows[0];
    assert.equal(Number(r.total_pilots), 24);
    assert.equal(Number(r.draft_pilots), 24);
    assert.equal(Number(r.inactive_pilots), 24);
    assert.equal(Number(r.pending_decision_pilots), 24);
    assert.equal(Number(r.obs_261_published), 1);
    assert.equal(Number(r.obs_261_value), 29850);
  });
});

