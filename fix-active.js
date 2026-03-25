const fs = require('fs');

const fileMapping = {
    'politique.html': 'Politique',
    'social.html': 'Social',
    'partis-politiques.html': 'Partis',
    'emissions.html': 'Émissions',
    'podcasts.html': 'Podcasts'
};

const files = [
    'cookies.html', 'mentions-legales.html', 'politique-confidentialite.html',
    'partis-politiques.html', 'social.html', 'politique.html',
    'podcasts.html', 'emissions.html', 'contact.html', 'podcast.html'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');

    // reset all active links to inactive
    content = content.replace(/class="mobile-nav-link active"/g, 'class="mobile-nav-link"');

    // set the correct active link if applicable
    const activeText = fileMapping[file];
    if (activeText) {
        // Find the specific li that contains the text and add the active class
        const regex = new RegExp(`(<a href="[^"]+" class="mobile-nav-link")([^>]*>${activeText}</a>)`, 'g');
        content = content.replace(regex, '$1 active"$2');
    }

    fs.writeFileSync(file, content);
});

console.log('Fixed active links');
