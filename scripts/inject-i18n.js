/**
 * Script d'injection automatique des attributs data-i18n
 * sur tous les éléments statiques des pages HTML du site.
 *
 * Correspondances texte → clé i18n ciblées :
 * - Navigation desktop & mobile
 * - Footer (titres, liens)
 * - Boutons d'auth, recherche
 * - Titres de sections communes
 */

const fs = require('fs');
const { JSDOM } = require('jsdom');

// ─── Table de correspondance texte → clé i18n ───────────────────────────────
// La clé est le texte FR normalisé (trim + lowercase), la valeur est la clé i18n
const TEXT_TO_KEY = {
    // Navigation
    'politique': 'nav_pol',
    'social': 'nav_soc',
    'partis': 'nav_parties',
    'émissions': 'nav_shows',
    'podcasts': 'nav_podcasts',
    'rechercher': 'nav_search',
    's\'identifier': 'nav_login',
    'connexion': 'nav_login',
    'se connecter': 'nav_login',
    'déconnexion': 'nav_logout',
    'se déconnecter': 'nav_logout',
    'profil': 'nav_profile',
    'accueil': 'nav_home',
    'administration': 'nav_admin',

    // Footer
    'rubriques': 'footer_rubriques',
    'légal': 'footer_legal',
    'contact': 'footer_contact',
    'à propos': 'footer_about',
    'conditions d\'utilisation': 'footer_terms',
    'politique de confidentialité': 'footer_privacy',
    'cookies': 'footer_cookies',
    'suivez-nous': 'footer_follow_us',
    'mentions légales': 'footer_legal',
    'cgu': 'footer_terms',
    'nous écrire': 'footer_contact',
    'tous droits réservés': 'footer_copyright',

    // Boutons
    'lire l\'article': 'btn_read',
    'lire la suite': 'btn_read_more',
    'écouter': 'btn_listen',
    'regarder': 'btn_watch',
    'voter': 'btn_vote',
    's\'abonner': 'btn_subscribe',
    'partager': 'btn_share',
    'commenter': 'btn_comment',
    'enregistrer': 'btn_save',
    'annuler': 'btn_cancel',
    'envoyer': 'btn_submit',
    'modifier': 'btn_edit',
    'supprimer': 'btn_delete',
    'retour': 'btn_back',
    'suivant': 'btn_next',
    'précédent': 'btn_previous',
    'écouter maintenant': 'show_watch_now',
    'regarder maintenant': 'show_watch_now',
    'télécharger': 'podcast_download',
    'publier': 'btn_submit',

    // Sections
    'discussions': 'comment_title',
    'commentaires': 'comment_title',
    'aucun commentaire pour le moment': 'comment_no_comments',
    'participez au débat...': 'comment_add',
    'chargement...': 'msg_loading',
    'derniers épisodes': 'podcast_latest_episodes',
    'tous les épisodes': 'podcast_latest_episodes',
    'à ne pas manquer': 'section_essentiel',
};

// ─── Sélecteurs à cibler (éléments dont le texte doit être traduit) ──────────
// On cible les éléments simples — pas les éléments avec du HTML enfant
const TARGET_SELECTORS = [
    'nav a.ph-link',
    'nav a.mobile-nav-link',
    'a.ph-btn-auth',
    'a.footer-link',
    '.footer-col h4',
    '.footer-bottom',
    'button[type="submit"]:not([data-i18n])',
    '.section-header',
    '.highlights-title',
    'h3.comment-section-title',
    'span[data-i18n]', // déjà annotés → on les laisse
];

const HTML_FILES = fs.readdirSync('.').filter(f => f.endsWith('.html') && f !== 'offline.html');

let totalInjected = 0;

for (const file of HTML_FILES) {
    let src = fs.readFileSync(file, 'utf8');
    const dom = new JSDOM(src);
    const doc = dom.window.document;
    let changed = 0;

    // Éléments ciblés par sélecteur
    const candidates = doc.querySelectorAll([
        'nav a.ph-link',
        'a.ph-btn-auth',
        'ul.mobile-nav-list a',
        'a.footer-link',
        '.footer-col h4',
        '.section-header',
        '.highlights-title',
        'h2.section-header',
        'h3.section-header',
        '.btn-comment',
        '.btn-listen',
        '.btn-watch',
    ].join(', '));

    candidates.forEach(el => {
        if (el.getAttribute('data-i18n')) return; // déjà annoté
        // Vérifier que c'est un nœud texte simple (pas d'enfants HTML)
        const hasChildElements = el.querySelector('*') !== null;
        if (hasChildElements) return;

        const text = (el.textContent || '').trim().toLowerCase();
        const key = TEXT_TO_KEY[text];
        if (key) {
            el.setAttribute('data-i18n', key);
            changed++;
        }
    });

    if (changed > 0) {
        // On sérialise proprement — on récupère seulement le body/head modifié
        const serialized = dom.serialize();
        fs.writeFileSync(file, serialized, 'utf8');
        console.log(`✅ ${file}: +${changed} data-i18n`);
        totalInjected += changed;
    } else {
        console.log(`⚪ ${file}: aucune modification`);
    }
}

console.log(`\n🎯 Total: ${totalInjected} attributs data-i18n injectés`);
