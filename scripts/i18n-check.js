/**
 * i18n-check.js — Détecteur automatique d'éléments non traduits
 * 
 * Usage: node scripts/i18n-check.js [--fix]
 *   Sans flag : affiche un rapport des éléments suspects non traduits
 *   Avec --fix : tente d'ajouter automatiquement les data-i18n manquants (pour les patterns connus)
 * 
 * Exécuter après avoir ajouté de nouvelles pages ou sections pour
 * détecter les textes statiques oubliés.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FIX_MODE = process.argv.includes('--fix');

// HTML files à analyser
const SKIP = ['admin.html','editeur-article.html','editeur-emission.html','editeur-parti.html','editeur-podcast.html'];
const HTML_FILES = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.html') && !SKIP.includes(f))
  .map(f => path.join(ROOT, f));

// Clés i18n connues (charge depuis i18n.js de façon simplifiée)
const i18nSrc = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');
const knownKeys = new Set();
const keyRegex = /^\s+(\w+):/gm;
let m;
while ((m = keyRegex.exec(i18nSrc)) !== null) knownKeys.add(m[1]);

// Patterns d'éléments HTML structurels qui DOIVENT être traduits
const MUST_TRANSLATE = [
  // Titres de groupe footer
  { pattern: /<span class="footer-group-title">[^<]+<\/span>/g, context: 'footer-group-title sans data-i18n' },
  // Footer summary
  { pattern: /<p class="footer-summary">[^{][^<]+<\/p>/g, context: 'footer-summary sans data-i18n' },
  // Footer bottom copyright
  { pattern: /<div class="footer-bottom">&copy;[^<]+<\/div>/g, context: 'footer-bottom sans data-i18n' },
  // Section labels
  { pattern: /<div class="section-label"(?![^>]*data-i18n)[^>]*>[^{<][^<]+<\/div>/g, context: 'section-label sans data-i18n' },
  // Boutons sans data-i18n avec texte FR visible
  { pattern: /<button[^>]*>(?![\s]*<)[A-ZÀ-Ÿa-zà-ÿ][^<]{3,}<\/button>/g, context: 'Bouton texte sans data-i18n' },
];

// Patterns de clés data-i18n utilisées mais non définies dans les traductions
const UNDEFINED_KEYS_PATTERN = /data-i18n="([^"]+)"/g;

let totalIssues = 0;
const report = [];

for (const fp of HTML_FILES) {
  const filename = path.basename(fp);
  let src = fs.readFileSync(fp, 'utf8');
  const issues = [];

  // 1. Éléments structurels non traduits
  for (const { pattern, context } of MUST_TRANSLATE) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(src)) !== null) {
      // Exclure si déjà data-i18n
      if (match[0].includes('data-i18n')) continue;
      issues.push({ type: 'MISSING_DATA_I18N', context, snippet: match[0].substring(0, 80).replace(/\s+/g, ' ') });
    }
  }

  // 2. Clés data-i18n utilisées mais non définies
  UNDEFINED_KEYS_PATTERN.lastIndex = 0;
  let km;
  while ((km = UNDEFINED_KEYS_PATTERN.exec(src)) !== null) {
    const key = km[1];
    if (!knownKeys.has(key)) {
      issues.push({ type: 'UNDEFINED_KEY', context: `Clé inconnue: "${key}"`, snippet: km[0] });
    }
  }

  if (issues.length > 0) {
    report.push({ file: filename, issues });
    totalIssues += issues.length;
  }
}

// Affichage du rapport
if (totalIssues === 0) {
  console.log('✅ Aucun problème de traduction détecté !');
} else {
  console.log(`\n🔍 RAPPORT i18n — ${totalIssues} problème(s) détecté(s)\n`);
  for (const { file, issues } of report) {
    console.log(`\n📄 ${file} (${issues.length} problème(s))`);
    for (const { type, context, snippet } of issues) {
      const icon = type === 'UNDEFINED_KEY' ? '❌' : '⚠️ ';
      console.log(`  ${icon} [${type}] ${context}`);
      console.log(`     → ${snippet}`);
    }
  }
  console.log(`\n──────────────────────────────────────────`);
  console.log(`Total: ${totalIssues} problème(s) dans ${report.length} fichier(s)`);
  console.log(`\nPour corriger les patterns connus: node scripts/i18n-check.js --fix`);
}

// MODE FIX : corrections automatiques pour patterns connus
if (FIX_MODE) {
  console.log('\n🔧 MODE FIX — Application des corrections automatiques...\n');
  
  const AUTO_FIX = [
    {
      pattern: /<span class="footer-group-title">Rubriques\s*:<\/span>/g,
      replacement: '<span class="footer-group-title" data-i18n="footer_rubriques">Rubriques :</span>'
    },
    {
      pattern: /<span class="footer-group-title">Espace\s*:<\/span>/g,
      replacement: '<span class="footer-group-title" data-i18n="footer_account">Espace :</span>'
    },
    {
      pattern: /<span class="footer-group-title">L[eé]gal\s*&amp;\s*Contact\s*:<\/span>/g,
      replacement: '<span class="footer-group-title" data-i18n="footer_legal_contact">Légal &amp; Contact :</span>'
    },
    {
      pattern: /<div class="footer-bottom">&copy;[^<]+<\/div>/g,
      replacement: '<div class="footer-bottom" data-i18n="footer_copyright">&copy; 2026 Solitiquo. Le média d\'analyse et d\'information. Tous droits réservés.</div>'
    },
    {
      pattern: /data-i18n="nav_emissions"/g,
      replacement: 'data-i18n="nav_shows"'
    },
    {
      pattern: /<p class="footer-summary">[\s\r\n]+Le média de référence pour l['']analyse politique, économique et sociale au Cameroun\.[\s\r\n]+<\/p>/g,
      replacement: '<p class="footer-summary" data-i18n="footer_summary">Le média de référence pour l\'analyse politique, économique et sociale au Cameroun.</p>'
    },
  ];

  let fixedFiles = 0;
  for (const fp of HTML_FILES) {
    let src = fs.readFileSync(fp, 'utf8');
    let changed = false;
    for (const { pattern, replacement } of AUTO_FIX) {
      pattern.lastIndex = 0;
      const newSrc = src.replace(pattern, replacement);
      if (newSrc !== src) { src = newSrc; changed = true; }
    }
    if (changed) {
      fs.writeFileSync(fp, src, 'utf8');
      console.log(`  ✅ Corrigé: ${path.basename(fp)}`);
      fixedFiles++;
    }
  }
  console.log(`\n✅ ${fixedFiles} fichier(s) corrigé(s) automatiquement.`);
}
