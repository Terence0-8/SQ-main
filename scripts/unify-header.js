/**
 * Script pour uniformiser les headers de toutes les pages.
 * Il prend le <header class="premium-header">...</header> de index.html
 * et l'injecte à la place du header existant dans toutes les autres pages.
 * Cela corrige les espacements (ex: justify-content: flex-end; gap: 20px) 
 * et assure un design pro 100% cohérent.
 */

const fs = require('fs');
const path = require('path');

// 1. Lire index.html et extraire le header modèle
const indexHtml = fs.readFileSync('index.html', 'utf8');
const headerMatch = indexHtml.match(/<header class="premium-header">([\s\S]*?)<\/header>/);

if (!headerMatch) {
    console.error("❌ Impossible de trouver le header dans index.html");
    process.exit(1);
}

// Le header complet qu'on va réinjecter
const newHeader = `<header class="premium-header">${headerMatch[1]}</header>`;

// 2. Parcourir tous les fichiers HTML
const files = fs.readdirSync('.').filter(f => f.endsWith('.html') && f !== 'index.html');
let updatedCount = 0;

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');

    // Chercher le header existant (peut importer son nom de classe exact, on cherche la balise header la plus haute)
    // Beaucoup de pages utilisent <header class="premium-header">, certaines peut-être juste <header> ou <header class="main-header">
    // On remplace le premier <header ...>...</header> qu'on trouve.
    // Exception pour admin.html/editeur-*.html qui ont un layout très différent ? Non, le header premium doit être partout s'il est utilisé.

    if (content.includes('<header class="premium-header">')) {
        const newContent = content.replace(/<header class="premium-header">[\s\S]*?<\/header>/, newHeader);
        if (content !== newContent) {
            fs.writeFileSync(file, newContent, 'utf8');
            console.log(`✅ ${file} : header uniformisé`);
            updatedCount++;
        }
    } else if (content.includes('<header class="main-header">')) {
        const newContent = content.replace(/<header class="main-header">[\s\S]*?<\/header>/, newHeader);
        if (content !== newContent) {
            fs.writeFileSync(file, newContent, 'utf8');
            console.log(`✅ ${file} : header uniformisé (remplacement de main-header)`);
            updatedCount++;
        }
    } else if (content.match(/<header[^>]*>[\s\S]*?<\/header>/)) {
        const newContent = content.replace(/<header[^>]*>[\s\S]*?<\/header>/, newHeader);
        if (content !== newContent) {
            fs.writeFileSync(file, newContent, 'utf8');
            console.log(`✅ ${file} : header uniformisé (remplacement générique)`);
            updatedCount++;
        }
    } else {
        console.log(`⚪ ${file} : aucun header trouvé, ignoré.`);
    }
}

console.log(`\n🎯 Uniformisation terminée. ${updatedCount} fichiers mis à jour.`);
