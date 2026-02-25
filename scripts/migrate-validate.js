// scripts/migrate-validate.js
// Vérifie que chaque migration a un up et down implémentés (pas de throw placeholder)

const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '../backend/migrations');

const files = fs.readdirSync(migrationsDir)
  .filter(f => /^\d+.*\.js$/.test(f) && f !== 'template.js')
  .sort();

if (files.length === 0) {
  console.log('ℹ️  Aucun fichier de migration trouvé.');
  process.exit(0);
}

let hasIssues = false;

console.log(`\n🔍 Validation de ${files.length} migration(s)...\n`);

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const content = fs.readFileSync(filePath, 'utf8');

  const issues = [];

  if (!content.includes('exports.up')) {
    issues.push('exports.up manquant');
  } else if (content.match(/exports\.up\s*=.*\{[\s\n]*throw/)) {
    issues.push('exports.up non implémenté (throw placeholder)');
  } else if (content.match(/exports\.up\s*=.*\{[\s\n]*\/\/\s*TODO.*\n[\s\n]*\}/)) {
    issues.push('exports.up semble vide (TODO uniquement)');
  }

  if (!content.includes('exports.down')) {
    issues.push('exports.down manquant');
  } else if (content.match(/exports\.down\s*=.*?\{[^}]*throw[^}]*\}/s)) {
    issues.push('exports.down non implémenté (throw placeholder)');
  }

  if (issues.length > 0) {
    console.log(`  ❌ ${file}`);
    for (const issue of issues) {
      console.log(`     → ${issue}`);
    }
    hasIssues = true;
  } else {
    console.log(`  ✅ ${file}`);
  }
}

console.log('');

if (hasIssues) {
  console.log('⚠️  Des migrations ont des fonctions non implémentées.');
  console.log('   Complétez les fonctions up/down avant de déployer.\n');
  process.exit(1);
} else {
  console.log('✅ Toutes les migrations sont implémentées.\n');
}
