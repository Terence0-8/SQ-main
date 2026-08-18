document.addEventListener('DOMContentLoaded', () => {

  console.log("Solitiquo JS chargé"); // Pour vérifier dans la console

  // ============================================================
  // 0. SERVICE WORKER (PWA)
  // ============================================================
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('✅ SW enregistré, scope:', reg.scope))
      .catch((err) => console.warn('⚠️ SW non enregistré:', err));
  }

  // ============================================================
  // 0.5. NAVIGATION GLOBALE (Active state)
  // ============================================================
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav.ph-nav .ph-link, ul.mobile-nav-list .mobile-nav-link').forEach(link => {
    link.classList.remove('active');
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // ============================================================
  // 0.6. FOOTER GLOBAL UNIFIÉ ET COMPLET
  // ============================================================
  renderGlobalFooter();

  // ============================================================
  // 1. GESTION DU MENU MOBILE (Burger)
  // ============================================================
  const burger = document.getElementById('burgerBtn') || document.getElementById('burgerMenu');
  const mobileNav = document.getElementById('mobileNav');
  const mobileClose = document.getElementById('mobileNavClose');
  const overlay = document.getElementById('mobileNavOverlay');

  function toggleMenu(show) {
    if (!mobileNav) return;
    if (show) {
      mobileNav.classList.add('nav-open');
      if (overlay) overlay.classList.add('active');
      document.body.classList.add('menu-open');
    } else {
      mobileNav.classList.remove('nav-open');
      if (overlay) overlay.classList.remove('active');
      document.body.classList.remove('menu-open');
    }
  }

  if (burger) burger.addEventListener('click', () => toggleMenu(true));
  if (mobileClose) mobileClose.addEventListener('click', () => toggleMenu(false));
  if (overlay) overlay.addEventListener('click', () => toggleMenu(false));

  // Fermeture auto au clic sur un lien mobile
  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', () => toggleMenu(false));
  });


  // ============================================================
  // 2. OVERLAY DE RECHERCHE GLASSMORPHISM (mobile-first)
  // ============================================================
  const searchBtn = document.getElementById('searchBtn');
  const searchContainer = document.getElementById('searchContainer');
  const searchInput = document.getElementById('searchInput');

  // Création de l'overlay global de recherche (injection dans DOM une seule fois)
  function createSearchOverlay() {
    if (document.getElementById('globalSearchOverlay')) return;
    const lang = (localStorage.getItem('siteLanguage') || 'fr');
    const placeholder = lang === 'en' ? 'Search...' : 'Rechercher...';
    const labelBtn = lang === 'en' ? 'Search' : 'Rechercher';

    const overlay = document.createElement('div');
    overlay.id = 'globalSearchOverlay';
    overlay.innerHTML = `
      <div class="gso-backdrop"></div>
      <div class="gso-box">
        <form class="gso-form" action="recherche.html" method="get">
          <div class="gso-input-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
            </svg>
            <input type="text" name="q" class="gso-input" placeholder="${placeholder}" autocomplete="off" autofocus>
            <button type="button" class="gso-close-btn" id="gsoClose" aria-label="Fermer">×</button>
          </div>
          <button type="submit" class="gso-submit">${labelBtn}</button>
        </form>
      </div>`;
    document.body.appendChild(overlay);

    // Fermeture
    overlay.querySelector('.gso-backdrop').addEventListener('click', closeSearchOverlay);
    overlay.querySelector('#gsoClose').addEventListener('click', closeSearchOverlay);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearchOverlay(); });
  }

  function openSearchOverlay() {
    createSearchOverlay();
    const overlay = document.getElementById('globalSearchOverlay');
    overlay.classList.add('active');
    setTimeout(() => {
      const input = overlay.querySelector('.gso-input');
      if (input) input.focus();
    }, 150);
    document.body.style.overflow = 'hidden';
  }

  function closeSearchOverlay() {
    const overlay = document.getElementById('globalSearchOverlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  // Centralized Header Search Toggle (Bulletproof)
  function handleSearchToggle(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const currentContainer = document.getElementById('searchContainer');
    const currentInput = document.getElementById('searchInput');
    if (!currentContainer) return;

    const isMobile = window.innerWidth <= 900;
    if (isMobile) {
      if (typeof openSearchOverlay === 'function') openSearchOverlay();
    } else {
      const isCurrentlyActive = currentContainer.classList.contains('active');
      if (isCurrentlyActive) {
        currentContainer.classList.remove('active');
      } else {
        currentContainer.classList.add('active');
        setTimeout(() => currentInput && currentInput.focus(), 100);
      }
    }
  }

  if (searchBtn && !searchBtn.dataset.searchInit) {
    searchBtn.dataset.searchInit = 'true';
    searchBtn.addEventListener('click', handleSearchToggle);
  }

  const searchLabelElem = document.getElementById('searchLabel');
  if (searchLabelElem && !searchLabelElem.dataset.searchInit) {
    searchLabelElem.dataset.searchInit = 'true';
    searchLabelElem.addEventListener('click', handleSearchToggle);
  }

  if (searchContainer) {
    searchContainer.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', (e) => {
      const currentBtn = document.getElementById('searchBtn');
      const currentLabel = document.getElementById('searchLabel');
      if (currentBtn && currentBtn.contains(e.target)) return;
      if (currentLabel && currentLabel.contains(e.target)) return;
      searchContainer.classList.remove('active');
    });
  }

  // Bouton loupe mobile dédié (burgerSearchBtn) si présent dans le header
  const burgerSearchBtn = document.getElementById('burgerSearchBtn');
  if (burgerSearchBtn) {
    burgerSearchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSearchOverlay();
    });
  }

  // ============================================================
  // 3. GESTION BANNIÈRE COOKIES
  // ============================================================
  // Vérifier si le consentement a déjà été donné
  if (!localStorage.getItem('cookieConsent')) {
    createCookieBanner();
  }
});

// Note: Plus besoin de gérer "Entrée" ou le clic "Loupe" en JS, 
// le <form> HTML s'en occupe nativement.

// ============================================================
// FONCTIONS BANNIÈRE COOKIES
// ============================================================
function createCookieBanner() {
  // 1. Création du HTML
  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.innerHTML = `
        <div class="cookie-content">
            <h4>🍪 Respect de votre vie privée</h4>
            <p>
                Nous utilisons des cookies pour sécuriser votre connexion et analyser notre audience. 
                Aucune donnée n'est revendue à des tiers.
                <a href="politique-confidentialite.html" class="cookie-link">En savoir plus</a>.
            </p>
        </div>
        <div class="cookie-actions">
            <button class="btn-cookie btn-refuse" id="btn-cookie-refuse">Continuer sans accepter</button>
            <button class="btn-cookie btn-accept" id="btn-cookie-accept">Accepter et fermer</button>
        </div>
    `;

  document.body.appendChild(banner);

  // 2. Animation d'entrée (petit délai pour l'effet)
  setTimeout(() => banner.classList.add('show'), 500);

  // 3. Gestion des clics
  document.getElementById('btn-cookie-accept').addEventListener('click', () => {
    saveConsent('accepted');
    hideBanner(banner);
  });

  document.getElementById('btn-cookie-refuse').addEventListener('click', () => {
    saveConsent('refused');
    hideBanner(banner);
  });
}

function saveConsent(status) {
  localStorage.setItem('cookieConsent', status);
  localStorage.setItem('cookieConsentDate', new Date().toISOString());
  // Ici, on pourrait activer/désactiver Google Analytics selon le statut
}

function hideBanner(banner) {
  banner.classList.remove('show');
  setTimeout(() => banner.remove(), 500); // Supprimer du DOM après l'anim
}

// ============================================================
// MODALES D'INCITATION À LA CONNEXION ET D'INFORMATION (MODERN GLASS)
// ============================================================
window.showAuthRequiredModal = function(message = "Vous devez être connecté pour participer à ce sondage.") {
  let existingModal = document.getElementById('auth-prompt-modal');
  if (existingModal) existingModal.remove();

  const modalHtml = `
    <div id="auth-prompt-modal" class="auth-modal-overlay">
      <div class="auth-modal-card">
        <button class="auth-modal-close" onclick="document.getElementById('auth-prompt-modal').remove()" aria-label="Fermer">×</button>
        <div class="auth-modal-icon">🔐</div>
        <h3 class="auth-modal-title">Connexion requise</h3>
        <p class="auth-modal-desc">${message}</p>
        <div class="auth-modal-actions">
          <a href="auth.html#register" class="auth-btn-primary">
            <span>S'inscrire</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
          </a>
          <a href="auth.html" class="auth-btn-secondary">J'ai déjà un compte</a>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
};

window.showGeneralErrorModal = function(title = "Information", message = "") {
  let existingModal = document.getElementById('general-error-modal');
  if (existingModal) existingModal.remove();

  const modalHtml = `
    <div id="general-error-modal" class="auth-modal-overlay">
      <div class="auth-modal-card">
        <button class="auth-modal-close" onclick="document.getElementById('general-error-modal').remove()" aria-label="Fermer">×</button>
        <div class="auth-modal-icon">⚠️</div>
        <h3 class="auth-modal-title">${title}</h3>
        <p class="auth-modal-desc">${message}</p>
        <div class="auth-modal-actions">
          <button class="auth-btn-primary" onclick="document.getElementById('general-error-modal').remove()" style="cursor:pointer; justify-content:center;">Compris</button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
};

// ============================================================
// 📍 FONCTION FOOTER GLOBAL UNIFIÉ ET COMPLET
// ============================================================
function renderGlobalFooter() {
  const footer = document.querySelector('footer.premium-footer');
  if (!footer) return;

  const currentLang = localStorage.getItem('siteLanguage') || 'fr';
  const isEn = currentLang === 'en';

  footer.innerHTML = `
    <div class="footer-inner">
      <div class="footer-top-row">
        <a href="index.html" class="footer-brand">
          <img src="/logo.svg" class="footer-logo" alt="Solitiquo Logo">
          <div class="brand-sep"></div>
          <span class="brand-text">Solitiquo</span>
        </a>
        <p class="footer-summary">
          ${isEn ? 'The benchmark media for political, economic and social analysis in Cameroon.' : 'Le média de référence pour l\'analyse politique, économique et sociale au Cameroun.'}
        </p>
      </div>

      <div class="footer-divider"></div>

      <div class="footer-links-row">
        <div class="footer-link-group">
          <span class="footer-group-title">${isEn ? 'Sections :' : 'Rubriques :'}</span>
          <a href="index.html" class="footer-link" data-i18n="nav_home">${isEn ? 'Home' : 'Accueil'}</a>
          <a href="politique.html" class="footer-link" data-i18n="nav_pol">${isEn ? 'Politics' : 'Politique'}</a>
          <a href="social.html" class="footer-link" data-i18n="nav_soc">${isEn ? 'Social & Society' : 'Social & Société'}</a>
          <a href="partis-politiques.html" class="footer-link" data-i18n="nav_parties">${isEn ? 'Political Parties' : 'Partis Politiques'}</a>
          <a href="podcasts.html" class="footer-link" data-i18n="nav_podcasts">${isEn ? 'Podcasts' : 'Podcasts'}</a>
          <a href="emissions.html" class="footer-link" data-i18n="nav_emissions">${isEn ? 'Shows' : 'Émissions'}</a>
          <a href="recherche.html" class="footer-link" data-i18n="nav_search">${isEn ? 'Search' : 'Recherche'}</a>
        </div>

        <div class="footer-link-group">
          <span class="footer-group-title">${isEn ? 'Account :' : 'Espace :'}</span>
          <a href="abonnement.html" class="footer-link" data-i18n="nav_sub">${isEn ? 'Subscribe' : 'S\'abonner'}</a>
          <a href="auth.html" class="footer-link" data-i18n="nav_login">${isEn ? 'Login / Register' : 'Connexion / Inscription'}</a>
          <a href="profil.html" class="footer-link" data-i18n="nav_profile">${isEn ? 'My Account' : 'Mon Compte'}</a>
        </div>

        <div class="footer-link-group">
          <span class="footer-group-title">${isEn ? 'Legal & Contact :' : 'Légal & Contact :'}</span>
          <a href="contact.html" class="footer-link" data-i18n="footer_contact">${isEn ? 'Contact Us' : 'Nous écrire / Contact'}</a>
          <a href="mentions-legales.html" class="footer-link" data-i18n="footer_legal">${isEn ? 'Legal Notice' : 'Mentions légales'}</a>
          <a href="conditions-utilisation.html" class="footer-link" data-i18n="footer_terms">${isEn ? 'Terms of Use (CGU)' : 'Conditions d\'utilisation (CGU)'}</a>
          <a href="politique-confidentialite.html" class="footer-link" data-i18n="footer_privacy">${isEn ? 'Privacy Policy' : 'Politique de confidentialité'}</a>
          <a href="cookies.html" class="footer-link" data-i18n="footer_cookies">${isEn ? 'Cookie Management' : 'Gestion des cookies'}</a>
        </div>
      </div>

      <div class="footer-bottom">&copy; 2026 Solitiquo. ${isEn ? 'The analysis & news media. All rights reserved.' : 'Le média d\'analyse et d\'information. Tous droits réservés.'}</div>
    </div>
  `;
}
