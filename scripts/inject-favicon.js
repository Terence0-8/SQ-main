const fs = require('fs');
const path = require('path');

const faviconBlock = [
    '  <!-- Favicon & icônes app -->',
    '  <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32x32.png">',
    '  <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16x16.png">',
    '  <link rel="icon" href="/favicon.ico">',
    '  <!-- Apple / iOS -->',
    '  <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-180x180.png">',
    '  <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png">',
    '  <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-167x167.png">',
    '  <meta name="apple-mobile-web-app-title" content="Solitiquo">',
    '  <meta name="apple-mobile-web-app-capable" content="yes">',
    '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
].join('\n');

const files = fs.readdirSync('.').filter(f => f.endsWith('.html'));
let count = 0;
for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('apple-touch-icon')) { console.log('SKIP (already has tags):', file); continue; }
    if (content.includes('</head>')) {
        content = content.replace('</head>', faviconBlock + '\n</head>');
        fs.writeFileSync(file, content, 'utf8');
        count++;
        console.log('Updated:', file);
    }
}
console.log('Done. Updated', count, 'files.');
