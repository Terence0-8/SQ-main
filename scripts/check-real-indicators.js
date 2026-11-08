const db = require('../backend/config/database');

async function checkIndicators() {
  const query = `
    SELECT id, code, name, category, unit, description, calculation_formula, producer_institution, methodological_limitations
    FROM data_indicators
    WHERE code !~* '^(IND_MIG|IND_TEST|IND_[0-9]{10,}|IND_API|IND_UI|IND_WF|IND_INACT|IND_IMP)'
      AND name !~* '^(Indicateur Test|Indicateur Mig|Indicateur Inactif|Indicateur Import)'
    ORDER BY id
  `;
  const res = await db.query(query);
  console.log('Real indicators count:', res.rows.length);
  console.table(res.rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category,
    unit: r.unit,
    producer: r.producer_institution
  })));
  process.exit(0);
}

checkIndicators().catch(err => {
  console.error(err);
  process.exit(1);
});

