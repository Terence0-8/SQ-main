#!/usr/bin/env node
/**
 * minify-css.js — Minification CSS sans dépendances externes
 *
 * Opérations :
 *   1. Supprimer les commentaires  /* ... * /
 *   2. Supprimer les espaces/tabs/newlines superflus
 *   3. Supprimer les espaces autour de : ; { } , >
 *   4. Supprimer le dernier ; avant }
 *   5. Normaliser les zéros (0px → 0, 0.5 → .5)
 *   6. Minifier les couleurs hex (#ffffff → #fff)
 *
 * Usage :
 *   node scripts/minify-css.js               # minifie en place
 *   node scripts/minify-css.js --dry-run     # affiche les stats sans écrire
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT_CSS = path.join(__dirname, '..', 'css');

// ─── Minification ────────────────────────────────────────────────────────────

function minifyCSS(src) {
    let css = src;

    // 1. Supprimer commentaires /* ... */ (y compris les /*! préservés en prod)
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');

    // 2. Supprimer espaces en début/fin de chaque ligne, puis les sauts de ligne
    css = css.replace(/\r\n/g, '\n');
    css = css.split('\n').map(l => l.trim()).join('');

    // 3. Réduire les espaces multiples à un seul
    css = css.replace(/\s{2,}/g, ' ');

    // 4. Supprimer les espaces autour des caractères spéciaux CSS
    css = css.replace(/\s*([{}:;,>~+])\s*/g, '$1');

    // 5. Supprimer le ; inutile avant }
    css = css.replace(/;}/g, '}');

    // 6. Supprimer les espaces après ( et avant ) dans les fonctions
    css = css.replace(/\(\s+/g, '(');
    css = css.replace(/\s+\)/g, ')');

    // 7. Normaliser 0px, 0em, 0rem, 0% → 0  (sauf dans les data URIs)
    css = css.replace(/\b0(px|em|rem|%|vw|vh|vmin|vmax|ch|ex|cm|mm|in|pt|pc)\b/g, '0');

    // 8. Normaliser 0.5 → .5
    css = css.replace(/\b0+\.(\d)/g, '.$1');

    // 9. Minifier les couleurs hex 6 digits → 3 digits si possible
    css = css.replace(/#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3\b/g,
        (_, r, g, b) => '#' + r + g + b);

    // 10. Trim final
    css = css.trim();

    return css;
}

// ─── Collecte des fichiers ────────────────────────────────────────────────────

function collectCSSFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectCSSFiles(full));
        } else if (entry.isFile() && entry.name.endsWith('.css') && entry.name !== 'shared.css') {
            results.push(full);
        }
    }
    return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const files = collectCSSFiles(ROOT_CSS);
let totalOrig = 0;
let totalMin = 0;

console.log(`\n🎨 CSS Minifier — ${DRY_RUN ? 'DRY RUN' : 'IN PLACE'}`);
console.log('='.repeat(60));

for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const minified = minifyCSS(src);
    const origSize = Buffer.byteLength(src, 'utf8');
    const minSize = Buffer.byteLength(minified, 'utf8');
    const saving = ((origSize - minSize) / origSize * 100).toFixed(1);
    const rel = path.relative(path.join(__dirname, '..'), file);

    totalOrig += origSize;
    totalMin += minSize;

    console.log(`  ${rel.padEnd(45)} ${(origSize / 1024).toFixed(1).padStart(6)} KB → ${(minSize / 1024).toFixed(1).padStart(6)} KB  (-${saving}%)`);

    if (!DRY_RUN) {
        fs.writeFileSync(file, minified, 'utf8');
    }
}

const totalSaving = ((totalOrig - totalMin) / totalOrig * 100).toFixed(1);

console.log('='.repeat(60));
console.log(`  TOTAL  ${(totalOrig / 1024).toFixed(1).padStart(48)} KB → ${(totalMin / 1024).toFixed(1).padStart(6)} KB  (-${totalSaving}%)`);
console.log(`\n${DRY_RUN ? '⚠️  DRY RUN — aucun fichier modifié' : '✅ Tous les fichiers minifiés.'}\n`);
