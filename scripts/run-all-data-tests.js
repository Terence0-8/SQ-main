const { execSync } = require('child_process');

const testFiles = [
  'tests/data_admin_interface.test.js',
  'tests/data_api.test.js',
  'tests/data_diffusion_exports_lot3d.test.js',
  'tests/data_human_validation_lot3c3.test.js',
  'tests/data_human_validation_lot3c4.test.js',
  'tests/data_human_validation_lot3e.test.js',
  'tests/data_human_validation_lot3e1.test.js',
  'tests/data_human_validation_lot3e2.test.js',
  'tests/data_human_validation_lot3e21.test.js',
  'tests/data_human_validation_lot3e3.test.js',
  'tests/data_human_validation_lot3e31.test.js',
  'tests/data_human_validation_lot3e32.test.js',
  'tests/data_human_validation_lot3e33.test.js',
  'tests/data_human_validation_lot3e34.test.js',
  'tests/data_documentary_archive_lot3e35.test.js',
  'tests/data_public_diffusion_lot3e4.test.js',
  'tests/data_e2e_launch_lot3f.test.js',
  'tests/data_production_readiness_lot3g.test.js',
  'tests/editorial_quality_lot3h.test.js',
  'tests/data_import.test.js',
  'tests/data_indicators_catalog.test.js',
  'tests/data_migration_1.test.js',
  'tests/data_migration_2.test.js',
  'tests/data_migration_3.test.js',
  'tests/data_pilot_real_data.test.js',
  'tests/data_publications.test.js',
  'tests/data_validation_workflow.test.js',
  'tests/data_workflow.test.js',
];

console.log(`Running all ${testFiles.length} DATA test suites...\n`);

const results = [];
let totalTests = 0;

for (const file of testFiles) {
  process.stdout.write(`Testing ${file} ... `);
  try {
    const out = execSync(`node --test --test-force-exit ${file}`, { stdio: 'pipe' }).toString();
    const match = out.match(/ℹ pass (\d+)/);
    const passCount = match ? parseInt(match[1], 10) : 0;
    totalTests += passCount;
    console.log(`PASS (${passCount} tests)`);
    results.push({ file, pass: true, count: passCount });
  } catch (err) {
    console.log(`FAIL`);
    const stdout = err.stdout ? err.stdout.toString() : '';
    const match = stdout.match(/✖ failing tests:[\s\S]{0,500}/);
    console.log(match ? match[0] : err.message.slice(0, 300));
    results.push({ file, pass: false, error: stdout.slice(-500) });
  }
}

console.log('\n--- SUMMARY ---');
const totalPassed = results.filter(r => r.pass).length;
console.log(`${totalPassed}/${testFiles.length} suites passed. Total tests passed: ${totalTests}`);
