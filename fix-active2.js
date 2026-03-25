const fs = require('fs');

const files = [
    'cookies.html', 'mentions-legales.html', 'politique-confidentialite.html',
    'partis-politiques.html', 'social.html', 'politique.html',
    'podcasts.html', 'emissions.html', 'contact.html', 'podcast.html'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    // reset all active links to inactive and remove any malformed active attributes
    content = content.replace(/class="mobile-nav-link" active"/g, 'class="mobile-nav-link active"');

    fs.writeFileSync(file, content);
});

console.log('Fixed malformed active links');
