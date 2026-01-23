document.addEventListener('DOMContentLoaded', () => {

  console.log("Solitiquo JS chargé"); // Pour vérifier dans la console

  // ============================================================
  // 1. GESTION DU MENU MOBILE (Burger)
  // ============================================================
  const burger = document.getElementById('burgerMenu');
  const mobileNav = document.getElementById('mobileNav');
  const mobileClose = document.getElementById('mobileNavClose');
  const overlay = document.getElementById('mobileNavOverlay');

  function toggleMenu(show) {
    if (!mobileNav) return;
    if (show) {
      mobileNav.classList.add('nav-open');
      if (overlay) overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    } else {
      mobileNav.classList.remove('nav-open');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
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
  // 2. GESTION DE LA RECHERCHE (Visuel uniquement)
  // ============================================================
  const searchBtn = document.getElementById('searchBtn');
  const searchContainer = document.getElementById('searchContainer');
  const searchInput = document.getElementById('searchInput');

  if (searchBtn && searchContainer) {
    // Ouvrir / Fermer au clic sur le bouton rond
    searchBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Empêche le clic de remonter au document
      searchContainer.classList.toggle('active');

      // Focus automatique
      if (searchContainer.classList.contains('active') && searchInput) {
        setTimeout(() => searchInput.focus(), 100);
      }
    });

    // Empêcher la fermeture quand on clique DANS le formulaire
    searchContainer.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Fermer si on clique ailleurs sur la page
    document.addEventListener('click', () => {
      searchContainer.classList.remove('active');
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
  // 1. Créer l'overlay de fond
  const overlay = document.createElement('div');
  overlay.className = 'cookie-overlay';
  overlay.id = 'cookieOverlay';

  // 2. Création du HTML de la bannière
  const banner = document.createElement('div');
  banner.className = 'cookie-banner';
  banner.innerHTML = `
        <div class="cookie-content">
            <h4>🍪 Choix sur les cookies</h4>
            <p>
                Nous utilisons des cookies essentiels pour sécuriser votre connexion et des cookies analytiques 
                pour améliorer notre site. Aucune donnée n'est revendue à des tiers.
                <br><br>
                <a href="politique-confidentialite.html" class="cookie-link">Consulter notre politique de confidentialité</a>
            </p>
        </div>
        <div class="cookie-actions">
            <button class="btn-cookie btn-refuse" id="btn-cookie-refuse">Cookies essentiels uniquement</button>
            <button class="btn-cookie btn-accept" id="btn-cookie-accept">Tout accepter</button>
        </div>
    `;

  // 3. Ajouter overlay puis bannière au DOM
  document.body.appendChild(overlay);
  document.body.appendChild(banner);

  // 4. Animation d'entrée (petit délai pour l'effet)
  setTimeout(() => {
    overlay.classList.add('show');
    banner.classList.add('show');
  }, 300);

  // 5. Gestion des clics
  document.getElementById('btn-cookie-accept').addEventListener('click', () => {
    saveConsent('accepted');
    hideBanner(banner, overlay);
  });

  document.getElementById('btn-cookie-refuse').addEventListener('click', () => {
    saveConsent('refused');
    hideBanner(banner, overlay);
  });
}

function saveConsent(status) {
  localStorage.setItem('cookieConsent', status);
  localStorage.setItem('cookieConsentDate', new Date().toISOString());
  console.log(`📊 Consentement cookies: ${status}`);
  // Ici, on pourrait activer/désactiver Google Analytics selon le statut
}

function hideBanner(banner, overlay) {
  banner.classList.remove('show');
  overlay.classList.remove('show');
  setTimeout(() => {
    banner.remove();
    overlay.remove();
  }, 400); // Supprimer du DOM après l'animation
}
