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
      if(overlay) overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    } else {
      mobileNav.classList.remove('nav-open');
      if(overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  if(burger) burger.addEventListener('click', () => toggleMenu(true));
  if(mobileClose) mobileClose.addEventListener('click', () => toggleMenu(false));
  if(overlay) overlay.addEventListener('click', () => toggleMenu(false));

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
});
  // Note: Plus besoin de gérer "Entrée" ou le clic "Loupe" en JS, 
  // le <form> HTML s'en occupe nativement.