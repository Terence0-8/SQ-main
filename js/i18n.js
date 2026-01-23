// ============================================================
// SYSTÈME DE TRADUCTION BILINGUE FR/EN
// Structure extensible pour internationalisation complète du site
// ============================================================

const TRANSLATIONS = {
    fr: {
        // Navigation
        nav_pol: 'Politique',
        nav_soc: 'Social',
        nav_parties: 'Partis',
        nav_shows: 'Émissions',
        nav_podcasts: 'Podcasts',

        // Sections homepage
        section_essentiel: 'L\'Essentiel de l\'info',
        section_obs: 'L\'Observatoire',
        section_discover: 'À Découvrir',

        // Recherche
        search_placeholder: 'Rechercher...',
        search_label: 'Rechercher',

        // Badges
        badge_une: 'À LA UNE',
        badge_poll: 'SONDAGE',
        badge_premium: 'PREMIUM',

        // Actions
        btn_read: 'Lire l\'article',
        btn_listen: 'Écouter',
        btn_vote: 'Voter',
        btn_subscribe: 'S\'abonner',

        // Footer (extensible)
        footer_rubriques: 'Rubriques',
        footer_legal: 'Légal',
        footer_contact: 'Contact',
        footer_copyright: 'Tous droits réservés'
    },
    en: {
        // Navigation
        nav_pol: 'Politics',
        nav_soc: 'Social',
        nav_parties: 'Parties',
        nav_shows: 'Shows',
        nav_podcasts: 'Podcasts',

        // Sections homepage
        section_essentiel: 'Essential News',
        section_obs: 'Observatory',
        section_discover: 'Discover',

        // Recherche
        search_placeholder: 'Search...',
        search_label: 'Search',

        // Badges
        badge_une: 'TOP STORY',
        badge_poll: 'POLL',
        badge_premium: 'PREMIUM',

        // Actions
        btn_read: 'Read article',
        btn_listen: 'Listen',
        btn_vote: 'Vote',
        btn_subscribe: 'Subscribe',

        // Footer
        footer_rubriques: 'Categories',
        footer_legal: 'Legal',
        footer_contact: 'Contact',
        footer_copyright: 'All rights reserved'
    }
};

// ============================================================
// FONCTIONS DE GESTION DE LANGUE
// ============================================================

/**
 * Récupère la langue actuelle depuis localStorage
 * @returns {string} 'fr' ou 'en', défaut 'fr'
 */
function getLanguage() {
    return localStorage.getItem('siteLanguage') || 'fr';
}

/**
 * Enregistre la langue sélectionnée
 * @param {string} lang - 'fr' ou 'en'
 */
function setLanguage(lang) {
    localStorage.setItem('siteLanguage', lang);
    console.log(`🌍 Langue changée: ${lang}`);
}

/**
 * Met à jour tous les textes de l'interface avec les traductions
 * @param {string} lang - Langue cible
 */
function updateInterfaceText(lang) {
    const translations = TRANSLATIONS[lang];

    // Mettre à jour tous les éléments avec data-i18n
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[key]) {
            element.textContent = translations[key];
        }
    });

    // Mettre à jour le placeholder de recherche
    const searchInput = document.getElementById('searchInput');
    if (searchInput && translations.search_placeholder) {
        searchInput.placeholder = translations.search_placeholder;
    }

    const searchLabel = document.getElementById('searchLabel');
    if (searchLabel && translations.search_label) {
        searchLabel.textContent = translations.search_label;
    }

    console.log(`✅ Interface mise à jour en ${lang.toUpperCase()}`);
}

/**
 * Charge les articles dans la langue spécifiée
 * @param {string} lang - Langue des articles à charger
 */
async function loadArticles(lang) {
    try {
        const res = await fetch(API_URL + '/articles?lang=' + lang);
        const json = await res.json();

        if (json.success && json.data.length > 0) {
            const articles = json.data;

            console.log(`📰 ${articles.length} articles chargés en ${lang}`);

            // 1. HERO (Article 0)
            const une = articles[0];
            const linkUne = `article.html?id=${une.id}`;
            const uneImg = une.image_url || 'https://via.placeholder.com/1600x900';

            document.getElementById('hero-dynamic').innerHTML = `
        <section class="grand-hero-section">
          <a href="${linkUne}" style="position:absolute; inset:0; z-index:2;"></a>
          <img src="${uneImg}" class="hero-bg-img" style="object-position: top center;">
          <div class="hero-overlay">
            <span class="hero-tag">${TRANSLATIONS[lang].badge_une} • ${une.category}</span>
            <h1 class="hero-title-main">${une.title}</h1>
            <p class="hero-excerpt">${une.excerpt || ''}</p>
          </div>
        </section>
      `;
            attachImageErrorHandlers(document.getElementById('hero-dynamic'));

            // 2. MAGAZINE LIST (Articles 1 à 4)
            const mainList = articles.slice(1, 5);
            document.getElementById('magazine-feed').innerHTML = mainList.map(art => {
                const linkArt = `article.html?id=${art.id}`;
                return `
        <article class="article-row">
          <div style="overflow:hidden; border-radius:4px; height:220px;">
            <a href="${linkArt}">
              <img src="${art.image_url}" class="art-img">
            </a>
          </div>
          <div class="art-info">
            <span class="art-cat">${art.category}</span>
            <a href="${linkArt}" style="text-decoration:none;">
              <h3 class="art-title">${art.title}</h3>
            </a>
            <p class="art-desc">${art.excerpt || art.slug}</p>
            <div style="font-size:0.8rem; color:#999; margin-top:8px;">${SolitiquoAPI.formatDate(art.published_at)}</div>
          </div>
        </article>
      `}).join('');

            attachImageErrorHandlers(document.getElementById('magazine-feed'));

            // 3. SIDEBAR DISCOVERY (Articles 5 à 8)
            const discoList = articles.slice(5, 9);
            const discoverGrid = document.getElementById('discover-grid');
            if (discoverGrid) {
                discoverGrid.innerHTML = discoList.map(art => {
                    const linkDisco = `article.html?id=${art.id}`;
                    return `
          <a href="${linkDisco}" class="disco-card">
            <img src="${art.image_url}" class="disco-img">
            <h4 class="disco-title">${art.title}</h4>
            <div class="disco-date">${SolitiquoAPI.formatDate(art.published_at)}</div>
          </a>
        `}).join('');

                attachImageErrorHandlers(discoverGrid);
            }
        } else {
            console.warn(`⚠️ Aucun article trouvé en ${lang}`);
            document.getElementById('magazine-feed').innerHTML = '<p style="text-align:center; padding:2rem; color:#888;">Aucun article disponible dans cette langue.</p>';
        }
    } catch (e) {
        console.error('❌ Erreur chargement articles:', e);
    }
}

// Note: Le reste du code original (menu burger, recherche, cookies) reste inchangé ci-dessous
