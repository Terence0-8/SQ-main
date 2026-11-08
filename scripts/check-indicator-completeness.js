const db = require('../backend/config/database');

async function checkIndicatorCompleteness() {
  const query = `
    SELECT id, code, name, category, unit, description, calculation_formula, producer_institution, methodological_limitations
    FROM data_indicators
    WHERE code !~* '^(IND_MIG|IND_TEST|IND_[0-9]{10,}|IND_API|IND_UI|IND_WF|IND_INACT|IND_IMP)'
      AND name !~* '^(Indicateur Test|Indicateur Mig|Indicateur Inactif|Indicateur Import)'
    ORDER BY id
  `;
  const res = await db.query(query);
  const incomplete = res.rows.filter(r => !r.description || !r.producer_institution || !r.calculation_formula || !r.methodological_limitations);
  console.log(`Total real indicators: ${res.rows.length}, Incomplete: ${incomplete.length}`);
  incomplete.forEach(r => {
    console.log(`  [${r.code}] ${r.name} - Missing: ${[!r.description ? 'desc' : '', !r.producer_institution ? 'producer' : '', !r.calculation_formula ? 'formula' : '', !r.methodological_limitations ? 'limits' : ''].filter(Boolean).join(', ')}`);
  });
  process.exit(0);
}

checkIndicatorCompleteness().catch(err => {
  console.error(err);
  process.exit(1);
});

