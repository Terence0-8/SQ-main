const fs = require('fs');
const file = 'backend/controllers/seoController.js';
let content = fs.readFileSync(file, 'utf8');

// The issue is lexical declarations (`const`, `let`) directly inside `case` blocks.
// They need to be wrapped in braces `{ ... }`

content = content.replace(
    /case 'article':\s*templateFile = 'article.html';\s*const articleRes =/,
    `case 'article': {\n                templateFile = 'article.html';\n                const articleRes =`
).replace(
    /\s*break;\s*case 'podcast':/,
    `\n                break;\n            }\n            case 'podcast':`
).replace(
    /case 'podcast':\s*templateFile = 'podcast.html';\s*const podcastRes =/,
    `case 'podcast': {\n                templateFile = 'podcast.html';\n                const podcastRes =`
).replace(
    /\s*break;\s*case 'emission':/,
    `\n                break;\n            }\n            case 'emission':`
).replace(
    /case 'emission':\s*templateFile = 'emissions.html';\s*const emissionRes =/,
    `case 'emission': {\n                templateFile = 'emissions.html';\n                const emissionRes =`
).replace(
    /\s*break;\s*case 'party':/,
    `\n                break;\n            }\n            case 'party':`
).replace(
    /case 'party':\s*templateFile = 'partis.html';\s*const partyRes =/,
    `case 'party': {\n                templateFile = 'partis.html';\n                const partyRes =`
).replace(
    /\s*break;\s*default:/,
    `\n                break;\n            }\n            default:`
);

fs.writeFileSync(file, content);
