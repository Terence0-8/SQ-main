/**
 * Injection des attributs data-i18n via remplacement de chaînes (sans jsdom)
 * Cible uniquement les éléments de navigation et footer avec du texte FR statique.
 */

const fs = require('fs');

const REPLACEMENTS = [
    // Nav desktop (ph-link)
    { from: 'href="politique.html" class="ph-link"', to: 'href="politique.html" class="ph-link" data-i18n="nav_pol"' },
    { from: 'href="politique.html" class="ph-link active"', to: 'href="politique.html" class="ph-link active" data-i18n="nav_pol"' },
    { from: 'href="social.html" class="ph-link"', to: 'href="social.html" class="ph-link" data-i18n="nav_soc"' },
    { from: 'href="social.html" class="ph-link active"', to: 'href="social.html" class="ph-link active" data-i18n="nav_soc"' },
    { from: 'href="partis-politiques.html" class="ph-link"', to: 'href="partis-politiques.html" class="ph-link" data-i18n="nav_parties"' },
    { from: 'href="partis-politiques.html" class="ph-link active"', to: 'href="partis-politiques.html" class="ph-link active" data-i18n="nav_parties"' },
    { from: 'href="emissions.html" class="ph-link"', to: 'href="emissions.html" class="ph-link" data-i18n="nav_shows"' },
    { from: 'href="emissions.html" class="ph-link active"', to: 'href="emissions.html" class="ph-link active" data-i18n="nav_shows"' },
    { from: 'href="podcasts.html" class="ph-link"', to: 'href="podcasts.html" class="ph-link" data-i18n="nav_podcasts"' },
    { from: 'href="podcasts.html" class="ph-link active"', to: 'href="podcasts.html" class="ph-link active" data-i18n="nav_podcasts"' },

    // Auth button (desktop)
    { from: 'href="auth.html" class="ph-btn-auth"', to: 'href="auth.html" class="ph-btn-auth" data-i18n="nav_login"' },

    // Nav mobile (mobile-nav-link) — si pas déjà annoté
    { from: 'href="index.html" class="mobile-nav-link"', to: 'href="index.html" class="mobile-nav-link" data-i18n="nav_home"' },

    // Footer links
    { from: 'href="politique.html" class="footer-link"', to: 'href="politique.html" class="footer-link" data-i18n="nav_pol"' },
    { from: 'href="social.html" class="footer-link"', to: 'href="social.html" class="footer-link" data-i18n="nav_soc"' },
    { from: 'href="partis-politiques.html" class="footer-link"', to: 'href="partis-politiques.html" class="footer-link" data-i18n="nav_parties"' },
    { from: 'href="contact.html" class="footer-link"', to: 'href="contact.html" class="footer-link" data-i18n="footer_contact"' },
    { from: 'href="auth.html" class="footer-link"', to: 'href="auth.html" class="footer-link" data-i18n="nav_login"' },
    { from: 'href="mentions-legales.html" class="footer-link"', to: 'href="mentions-legales.html" class="footer-link" data-i18n="footer_legal"' },
    { from: 'href="conditions-utilisation.html" class="footer-link"', to: 'href="conditions-utilisation.html" class="footer-link" data-i18n="footer_terms"' },
    { from: 'href="politique-confidentialite.html" class="footer-link"', to: 'href="politique-confidentialite.html" class="footer-link" data-i18n="footer_privacy"' },
    { from: 'href="cookies.html" class="footer-link"', to: 'href="cookies.html" class="footer-link" data-i18n="footer_cookies"' },
];

const HTML_FILES = fs.readdirSync('.').filter(f => f.endsWith('.html'));
let totalFiles = 0;

for (const file of HTML_FILES) {
    let src = fs.readFileSync(file, 'utf8');
    let changed = false;

    for (const { from, to } of REPLACEMENTS) {
        if (src.includes(from) && !src.includes(to)) {
            src = src.split(from).join(to);
            changed = true;
        }
    }

    if (changed) {
        fs.writeFileSync(file, src, 'utf8');
        console.log('✅ Updated:', file);
        totalFiles++;
    }
}

console.log(`\n🎯 Done. Updated ${totalFiles} files.`);
