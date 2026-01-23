// Script pour ajouter solitiquo.js à tous les fichiers HTML
const fs = require('fs');
const path = require('path');

const files = [
    'article.html',
    'abonnement.html',
    'auth.html',
    'contact.html',
    'dossier.html',
    'missions.html',
    'paiement-success.html',
    'paiement.html',
    'partis-politiques.html',
    'podcast.html',
    'podcasts.html',
    'profil.html',
    'politique.html',
    'recherche.html',
    'social.html'
];

const scriptToAdd = '  <script src="js/solitiquo.js"></script>\n';
const searchPattern = '  <script src="js/config.js"></script>';

let modified = 0;
let alreadyPresent = 0;
let errors = 0;

files.forEach(file => {
    const filePath = path.join(__dirname, '..', file);

    if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Fichier non trouvé: ${file}`);
        return;
    }

    try {
        let content = fs.readFileSync(filePath, 'utf-8');

        // Vérifier si solitiquo.js est déjà présent
        if (content.includes('solitiquo.js')) {
            console.log(`ℹ️  ${file} - solitiquo.js déjà présent`);
            alreadyPresent++;
            return;
        }

        // Vérifier si config.js est présent
        if (!content.includes(searchPattern)) {
            console.log(`⚠️  ${file} - config.js pattern non trouvé`);
            errors++;
            return;
        }

        // Ajouter solitiquo.js avant config.js
        content = content.replace(searchPattern, scriptToAdd + searchPattern);

        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`✅ ${file} - solitiquo.js ajouté`);
        modified++;

    } catch (err) {
        console.error(`❌ Erreur avec ${file}:`, err.message);
        errors++;
    }
});

console.log(`\n📊 Résumé:`);
console.log(`✅ Modifiés: ${modified}`);
console.log(`ℹ️  Déjà présents: ${alreadyPresent}`);
console.log(`❌ Erreurs: ${errors}`);
