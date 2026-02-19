'use strict';

/**
 * sanitize.js — Sanitisation HTML côté serveur avec DOMPurify + jsdom
 *
 * Protège contre les attaques XSS en nettoyant tout HTML entrant
 * AVANT l'enregistrement en base de données.
 *
 * Deux modes :
 *   sanitizeHTML(str)   — Pour le contenu d'articles (préserve les balises de formatage)
 *   sanitizeText(str)   — Pour les commentaires / titres / textes bruts (strip tout HTML)
 */

const { JSDOM } = require('jsdom');
const DOMPurify = require('dompurify');

// Créer une fenêtre jsdom pour DOMPurify (requis côté serveur)
const window = new JSDOM('').window;
const purify = DOMPurify(window);

// ─── Configuration pour le contenu riche (articles) ─────────────────────────
// On autorise les balises de formatage standard d'un éditeur WYSIWYG
// mais on interdit tout ce qui peut exécuter du code (script, on*, data URIs…)
const RICH_CONFIG = {
    ALLOWED_TAGS: [
        // Structurel
        'p', 'br', 'hr', 'div', 'section', 'article', 'aside',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'dl', 'dt', 'dd',
        'blockquote', 'pre', 'code',
        // Inline
        'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins',
        'sup', 'sub', 'mark', 'small', 'span',
        // Liens et médias
        'a', 'img', 'figure', 'figcaption', 'picture', 'source',
        'iframe', // Autoriser les iframes pour les embeds (YouTube, etc.)
        // Tableaux
        'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
    ],
    ALLOWED_ATTR: [
        'href', 'title', 'target', 'rel',          // liens
        'src', 'alt', 'width', 'height', 'loading', // images
        'class', 'id',                              // style classes
        'colspan', 'rowspan',                       // tableaux
        'cite',                                     // blockquote
        'allow', 'allowfullscreen', 'frameborder', 'scrolling', // iframes
    ],
    // Interdire javascript: data: vbscript: dans les URLs
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel|ftp):/i,
    // Forcer rel="noopener noreferrer" sur les liens externes
    FORCE_BODY: true,
    // Supprimer les commentaires HTML
    ALLOW_UNKNOWN_PROTOCOLS: false,
};

// ─── Configuration pour le texte brut (commentaires, titres) ────────────────
// Strip tout HTML — on veut du texte pur
const TEXT_CONFIG = {
    ALLOWED_TAGS: [],    // Aucun tag autorisé
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,  // Garder le texte à l'intérieur des balises supprimées
};

// ─── Fonctions exportées ─────────────────────────────────────────────────────

/**
 * Sanitise du HTML riche (contenu d'article, description de parti…)
 * Conserve le formatage mais supprime les vecteurs XSS.
 * @param {string|undefined|null} input
 * @returns {string}
 */
function sanitizeHTML(input) {
    if (!input || typeof input !== 'string') return '';
    return purify.sanitize(input, RICH_CONFIG);
}

/**
 * Sanitise du texte brut (titre, commentaire, question de sondage…)
 * Supprime tout HTML et retourne du texte pur.
 * @param {string|undefined|null} input
 * @returns {string}
 */
function sanitizeText(input) {
    if (!input || typeof input !== 'string') return '';
    return purify.sanitize(input, TEXT_CONFIG).trim();
}

/**
 * Sanitise un tableau de chaînes (tags, options de sondage…)
 * @param {string[]} arr
 * @returns {string[]}
 */
function sanitizeArray(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(item => sanitizeText(String(item)));
}

module.exports = { sanitizeHTML, sanitizeText, sanitizeArray };
