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
 * Enregistre la langue sélectionnée dans localStorage ET backend
 * @param {string} lang - 'fr' ou 'en'
 */
async function setLanguage(lang) {
  // 1. Sauvegarde immédiate dans localStorage (feedback instant)
  localStorage.setItem('siteLanguage', lang);
  console.log(`🌍 Langue changée: ${lang}`);

  // 2. Synchronisation avec le backend (persistance cross-session/cross-device)
  try {
    const response = await fetch(API_URL + '/language/preference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ language: lang })
    });

    const data = await response.json();
    if (data.success) {
      console.log(`✅ Langue synchronisée avec le serveur: ${lang}`);
    }
  } catch (error) {
    console.warn('⚠️ Impossible de synchroniser avec le serveur (mode hors ligne)');
  }
}

/**
 * Charge la préférence de langue depuis le backend
 * Utilisé au chargement initial de la page si localStorage est vide
 * @returns {Promise<string>} La langue préférée ('fr' ou 'en')
 */
async function loadLanguagePreference() {
  // Si localStorage existe déjà, l'utiliser (plus rapide)
  const cachedLang = localStorage.getItem('siteLanguage');
  if (cachedLang) {
    return cachedLang;
  }

  // Sinon, charger depuis le backend
  try {
    const response = await fetch(API_URL + '/language/preference', {
      credentials: 'include'
    });
    const data = await response.json();

    if (data.success && data.language) {
      localStorage.setItem('siteLanguage', data.language);
      console.log(`📥 Langue chargée depuis le serveur: ${data.language} (source: ${data.source})`);
      return data.language;
    }
  } catch (error) {
    console.warn('⚠️ Impossible de charger la préférence depuis le serveur');
  }

  // Fallback: français par défaut
  return 'fr';
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

/**
 * FONCTION PRINCIPALE D'INITIALISATION
 * À appeler depuis n'importe quelle page pour activer le système de langue
 * @param {Object} options - Options de configuration
 * @param {boolean} options.reloadArticles - Si true, recharge les articles après changement (pour index.html)
 * @param {boolean} options.reloadPage - Si true, recharge la page après changement (pour autres pages)
 */
async function initLanguageSwitcher(options = {}) {
  const { reloadArticles = false, reloadPage = true } = options;

  try {
    // 1. Charger la préférence de langue (localStorage ou backend)
    const currentLang = await loadLanguagePreference();

    // 2. Mettre à jour l'interface avec la langue chargée
    updateInterfaceText(currentLang);

    // 3. Initialiser les boutons segmentés
    const langButtons = document.querySelectorAll('.lang-seg-btn');

    if (langButtons.length === 0) {
      console.warn('⚠️ Aucun bouton de langue trouvé sur cette page');
      return;
    }

    // 4. Définir l'état actif des boutons
    langButtons.forEach(btn => {
      const btnLang = btn.getAttribute('data-lang');
      if (btnLang === currentLang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 5. Attacher les event listeners
    langButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const selectedLang = btn.getAttribute('data-lang');

        // Ne rien faire si on clique sur la langue déjà active
        if (selectedLang === getLanguage()) return;

        // Mettre à jour les états actifs
        langButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Sauvegarder la langue (localStorage + backend)
        await setLanguage(selectedLang);

        // Mettre à jour l'interface
        updateInterfaceText(selectedLang);

        // Action post-changement selon la page
        if (reloadArticles && typeof loadArticles === 'function') {
          // Page index.html: recharger les articles dynamiquement
          await loadArticles(selectedLang);
          console.log(`🌍 Articles rechargés en ${selectedLang.toUpperCase()}`);
        } else if (reloadPage) {
          // Autres pages: recharger la page pour appliquer la langue
          console.log(`🌍 Rechargement de la page en ${selectedLang.toUpperCase()}`);
          location.reload();
        }
      });
    });

    console.log(`✅ Language switcher initialized (${currentLang})`);

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation du language switcher:', error);
  }
}

