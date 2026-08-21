// URL API dynamique (configurée par config.js ou fallback)
var API_URL = window.API_URL || (window.location.origin + '/api');
window.API_URL = API_URL;

const SolitiquoAPI = {
  // --- ARTICLES ---
  getArticles: async (filters = '') => {
    try {
      const query = filters.startsWith('?') ? filters : '';
      const response = await fetch(`${API_URL}/articles${query}`);
      if (!response.ok) throw new Error('Erreur réseau');
      const json = await response.json();
      const articles = json.data || [];
      if (articles.length > 0) {
        try { localStorage.setItem('solitiquo_cached_articles', JSON.stringify(articles)); } catch (_e) {}
      }
      return articles;
    } catch (error) {
      console.warn("⚠️ Client Hors-ligne — Récupération des articles en cache/IndexedDB");
      if (typeof showOfflineBanner === 'function') showOfflineBanner();
      try {
        if (window.SolitiquoOffline) {
          const downloads = await window.SolitiquoOffline.getAllDownloads();
          const offlineArticles = downloads.filter(d => d.type === 'article');
          if (offlineArticles.length > 0) return offlineArticles;
        }
        const cached = localStorage.getItem('solitiquo_cached_articles');
        if (cached) return JSON.parse(cached);
      } catch (_e) {}
      return [];
    }
  },

  getArticleById: async (id) => {
    try {
      const lang = localStorage.getItem('siteLanguage') || 'fr';
      let response;
      if (!isNaN(id)) {
        response = await fetch(`${API_URL}/articles/${id}?lang=${lang}`);
      }
      if (!response || !response.ok) {
        response = await fetch(`${API_URL}/articles/by-slug/${encodeURIComponent(id)}?lang=${lang}`);
      }
      if (!response.ok) throw new Error('Introuvable');
      const json = await response.json();
      return json.article || json.data;
    } catch (error) {
      if (typeof showOfflineBanner === 'function') showOfflineBanner();
      try {
        if (window.SolitiquoOffline) {
          const item = await window.SolitiquoOffline.getContent(id, 'article');
          if (item) return item;
        }
        const cachedArticles = JSON.parse(localStorage.getItem('solitiquo_cached_articles') || '[]');
        const found = cachedArticles.find(a => String(a.id) === String(id) || a.slug === id);
        if (found) return found;
      } catch (_e) {}
      return null;
    }
  },

  formatDate: (dateString, customLang) => {
    if (!dateString) return '';
    const lang = customLang || (typeof getLanguage === 'function' ? getLanguage() : (localStorage.getItem('siteLanguage') || 'fr'));
    const locale = lang === 'en' ? 'en-US' : 'fr-FR';
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return new Date(dateString).toLocaleDateString(locale, options);
  },

  // --- PODCASTS ---
  getPodcasts: async () => {
    try {
      const lang = localStorage.getItem('siteLanguage') || 'fr';
      const response = await fetch(`${API_URL}/podcasts?lang=${lang}`);
      if (!response.ok) throw new Error('Erreur réseau');
      const json = await response.json();
      const podcasts = json.data || [];
      if (podcasts.length > 0) {
        try { localStorage.setItem('solitiquo_cached_podcasts', JSON.stringify(podcasts)); } catch (_e) {}
      }
      return podcasts;
    } catch (error) {
      if (typeof showOfflineBanner === 'function') showOfflineBanner();
      try {
        if (window.SolitiquoOffline) {
          const downloads = await window.SolitiquoOffline.getAllDownloads();
          const offlinePodcasts = downloads.filter(d => d.type === 'podcast');
          if (offlinePodcasts.length > 0) return offlinePodcasts;
        }
        const cached = localStorage.getItem('solitiquo_cached_podcasts');
        if (cached) return JSON.parse(cached);
      } catch (_e) {}
      return [];
    }
  },

  getPodcastById: async (id) => {
    try {
      const lang = localStorage.getItem('siteLanguage') || 'fr';
      const response = await fetch(`${API_URL}/podcasts/${id}?lang=${lang}`);
      if (!response.ok) throw new Error('Introuvable');
      const json = await response.json();
      return json.podcast;
    } catch (error) {
      if (typeof showOfflineBanner === 'function') showOfflineBanner();
      try {
        if (window.SolitiquoOffline) {
          const item = await window.SolitiquoOffline.getContent(id, 'podcast');
          if (item) return item;
        }
      } catch (_e) {}
      return null;
    }
  },

  // --- AUTHENTIFICATION ---
  register: async (userData) => {
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });
      return await res.json();
    } catch (e) { return { success: false, error: e.message }; }
  },

  login: async (credentials) => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials), credentials: 'include'
      });
      return await res.json();
    } catch (e) { return { success: false, error: e.message }; }
  },

  logout: async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': SolitiquoAPI.csrfToken },
        credentials: 'include'
      });
      localStorage.clear();
      window.location.href = 'index.html';
    } catch (e) { console.error(e); }
  },

  getProfile: async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' });
      const json = await res.json();
      if (json.success && json.isLoggedIn && json.user) {
        try { localStorage.setItem('solitiquo_cached_user', JSON.stringify(json.user)); } catch (_e) {}
        return json.user;
      }
      return null;
    } catch (e) {
      if (typeof showOfflineBanner === 'function') showOfflineBanner();
      try {
        const cached = localStorage.getItem('solitiquo_cached_user');
        if (cached) return JSON.parse(cached);
      } catch (_err) {}
      return null;
    }
  },

  // --- UI MANAGEMENT (Cerveau Interface) ---
  initUserInterface: async () => {
    if (document.body.dataset.uiInited === 'true') return;
    const user = await SolitiquoAPI.getProfile();

    if (user) {
      document.body.classList.add('user-logged-in');
      document.body.dataset.userLogged = 'true';
    } else {
      document.body.classList.remove('user-logged-in');
      document.body.dataset.userLogged = 'false';
      return;
    }

    document.body.dataset.uiInited = 'true';
    const nav = document.querySelector('.ph-right');

    // 1. Bouton Profil (ciblé spécifiquement sans toucher au Dashboard)
    const userIconSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px; margin-right:4px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    const profileBtn = nav ? nav.querySelector('.ph-btn-auth:not(#nav-dash-btn)') : document.querySelector('.ph-btn-auth');
    if (profileBtn) {
      profileBtn.id = 'nav-profile-btn';
      profileBtn.removeAttribute('data-i18n');
      profileBtn.dataset.loggedIn = 'true';
      profileBtn.innerHTML = `${userIconSvg} <span>${user.username}</span>`;
      profileBtn.href = "profil.html";
      profileBtn.style.backgroundColor = "#f0f0f0";
      profileBtn.style.color = "#37463D";
      profileBtn.style.border = "1px solid #ddd";
      profileBtn.onclick = (e) => {
        e.preventDefault();
        window.location.href = "profil.html";
      };
    }

    // Mise à jour de tous les liens vers auth.html pour les connecter au profil
    document.querySelectorAll('a[href="auth.html"]').forEach(link => {
      link.href = "profil.html";
      link.removeAttribute('data-i18n');
      link.dataset.loggedIn = 'true';
      const textSpan = link.querySelector('[data-i18n]');
      if (textSpan) textSpan.removeAttribute('data-i18n');
      link.innerHTML = `${userIconSvg} <span>${user.username}</span>`;
    });

    // 2. SI ADMIN : Ajouter le bouton Dashboard (une seule fois)
    if ((user.role === 'admin' || user.role === 'writer') && nav && !document.getElementById('nav-dash-btn')) {
      document.body.classList.add('is-admin');
      const dashBtn = document.createElement('a');
      dashBtn.id = 'nav-dash-btn';
      dashBtn.href = "admin.html";
      dashBtn.className = "ph-btn-auth";
      const gearSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px; margin-right:5px;"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
      dashBtn.innerHTML = `${gearSvg} <span>Dashboard</span>`;
      dashBtn.style.marginRight = "10px";
      dashBtn.style.backgroundColor = "#37463D";
      dashBtn.style.color = "white";

      if (profileBtn) {
        nav.insertBefore(dashBtn, profileBtn);
      } else {
        nav.appendChild(dashBtn);
      }
    }
  },

  // --- ADMIN ACTIONS (Depuis le site) ---
  deleteComment: async (commentId) => {
    if (!confirm("Admin : Supprimer ce commentaire définitivement ?")) return;
    try {
      // On utilise la route admin existante
      const res = await fetch(`${API_URL}/admin/comments/${commentId}/delete`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': SolitiquoAPI.csrfToken }, // Ajout du token
        credentials: 'include' // Important pour que le serveur sache que c'est l'admin
      });
      const json = await res.json();
      if (json.success) {
        // Supprimer visuellement
        const el = document.getElementById(`comment-${commentId}`);
        if (el) el.remove();
        alert("Commentaire supprimé !");
      } else {
        alert("Erreur : " + json.error);
      }
    } catch (e) { alert("Erreur serveur"); }
  },

  // --- CSRF MANAGEMENT ---
  csrfToken: null,
  initCsrf: async () => {
    try {
      const res = await fetch(`${API_URL}/csrf-token`, { credentials: 'include' });
      const json = await res.json();
      if (json.csrfToken) {
        SolitiquoAPI.csrfToken = json.csrfToken;
        console.log('🔒 CSRF Token récupéré');
      }
    } catch (e) { console.warn('Erreur récupération CSRF:', e); }
  }
};

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', async () => {
  await SolitiquoAPI.initCsrf(); // D'abord le token
  await SolitiquoAPI.initUserInterface(); // Ensuite l'UI
});

// Réagir au changement de langue pour les éléments dynamiques
document.addEventListener('languageChanged', (e) => {
  const lang = e.detail.lang;
  const authBtns = document.querySelectorAll('.ph-btn-auth');
  authBtns.forEach(btn => {
    if (btn.href && btn.href.includes('auth.html')) {
      btn.textContent = lang === 'en' ? 'Sign in' : "S'identifier";
    }
  });
});

// ── GESTION HORS-CONNEXION SOLITIQUO (CHARTE MARQUE) ──

// 1. MODALE CENTRÉE DE PANNE SANS RÉSEAU (1s de délai + Flou d'arrière-plan)
window.showOfflineModal = function() {
  if (document.getElementById('offline-modal-overlay')) return;

  setTimeout(async () => {
    if (navigator.onLine) return; // Si la connexion est revenue entre-temps
    if (document.getElementById('offline-modal-overlay')) return;

    let isPremiumUser = false;
    try {
      const user = await SolitiquoAPI.getProfile();
      if (user && (user.is_subscriber || user.role === 'admin' || user.role === 'writer')) {
        isPremiumUser = true;
      }
    } catch (_e) {}

    const overlay = document.createElement('div');
    overlay.id = 'offline-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 999999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(55, 70, 61, 0.55);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      animation: offlineFadeIn 0.3s ease;
      padding: 20px;
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      max-width: 440px;
      width: 100%;
      background: #FFFFFF;
      border-radius: 24px;
      padding: 32px 28px;
      text-align: center;
      border: 1px solid rgba(55, 70, 61, 0.12);
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.25);
      font-family: Inter, system-ui, -apple-system, sans-serif;
      position: relative;
    `;

    const accentColor = isPremiumUser ? '#C9A227' : '#C82823';

    if (isPremiumUser) {
      box.innerHTML = `
        <div style="width:64px; height:64px; margin:0 auto 18px auto; background:rgba(201, 162, 39, 0.12); border-radius:50%; display:flex; align-items:center; justify-content:center;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <circle cx="12" cy="20" r="1" fill="${accentColor}" stroke="none"/>
          </svg>
        </div>
        <h3 style="font-family:'Playfair Display', Georgia, serif; font-size:1.6rem; font-weight:700; color:#37463D; margin-bottom:10px; line-height:1.2;">
          Mode Hors-connexion
        </h3>
        <p style="font-size:0.92rem; color:#475569; line-height:1.6; margin-bottom:24px;">
          Vous êtes actuellement hors-connexion. Consultez vos contenus enregistrés en disponibilité hors-ligne directement dans votre espace Téléchargements.
        </p>
        <a href="profil.html?tab=downloads" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; background:rgba(201, 162, 39, 0.12); color:#B08B1E; border:1px solid rgba(201, 162, 39, 0.4); padding:13px 24px; border-radius:30px; font-weight:700; font-size:0.95rem; text-decoration:none; box-shadow:0 4px 16px rgba(201, 162, 39, 0.15); transition:all 0.2s;">
          Voir mes téléchargements →
        </a>
        <button type="button" onclick="document.getElementById('offline-modal-overlay')?.remove()" style="margin-top:14px; background:none; border:none; color:#94A3B8; font-size:0.85rem; font-weight:600; cursor:pointer; text-decoration:underline;">
          Continuer la navigation hors-ligne
        </button>
      `;
    } else {
      box.innerHTML = `
        <div style="width:64px; height:64px; margin:0 auto 18px auto; background:rgba(200, 40, 35, 0.08); border-radius:50%; display:flex; align-items:center; justify-content:center;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${accentColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"/>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <circle cx="12" cy="20" r="1" fill="${accentColor}" stroke="none"/>
          </svg>
        </div>
        <h3 style="font-family:'Playfair Display', Georgia, serif; font-size:1.6rem; font-weight:700; color:#37463D; margin-bottom:10px; line-height:1.2;">
          Mode Hors-connexion
        </h3>
        <p style="font-size:0.92rem; color:#475569; line-height:1.6; margin-bottom:24px;">
          Vous êtes actuellement hors-connexion. La disponibilité des contenus hors-ligne est une fonctionnalité réservée aux abonnés Premium.
        </p>
        <a href="abonnement.html" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; background:rgba(200, 40, 35, 0.08); color:#C82823; border:1px solid rgba(200, 40, 35, 0.3); padding:13px 24px; border-radius:30px; font-weight:700; font-size:0.95rem; text-decoration:none; box-shadow:0 4px 16px rgba(200, 40, 35, 0.12); transition:all 0.2s;">
          S'abonner au Premium →
        </a>
        <button type="button" onclick="document.getElementById('offline-modal-overlay')?.remove()" style="margin-top:14px; background:none; border:none; color:#94A3B8; font-size:0.85rem; font-weight:600; cursor:pointer; text-decoration:underline;">
          Fermer cette fenêtre
        </button>
      `;
    }

    if (!document.getElementById('offline-modal-style')) {
      const style = document.createElement('style');
      style.id = 'offline-modal-style';
      style.textContent = `
        @keyframes offlineFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }, 1000);
};

// 2. BULLE DISCRÈTE LORSQUE LA CONNEXION EST RÉTABLIE
window.showOnlineToast = function() {
  // Fermer la modale hors-ligne si elle est encore affichée
  document.getElementById('offline-modal-overlay')?.remove();
  if (document.getElementById('online-bubble-toast')) return;

  const bubble = document.createElement('div');
  bubble.id = 'online-bubble-toast';
  bubble.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 999999;
    max-width: 320px;
    width: calc(100% - 48px);
    background: rgba(55, 70, 61, 0.95);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: #F8FBF1;
    padding: 14px 18px;
    border-radius: 16px;
    border: 1px solid rgba(134, 239, 172, 0.4);
    box-shadow: 0 12px 30px rgba(55, 70, 61, 0.25);
    font-family: Inter, system-ui, -apple-system, sans-serif;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: offlineFadeIn 0.3s ease;
  `;

  bubble.innerHTML = `
    <div style="width:32px; height:32px; border-radius:50%; background:rgba(134, 239, 172, 0.2); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#86EFAC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <div style="flex:1;">
      <div style="font-weight:700; font-size:0.88rem; color:#FFF;">Connexion rétablie</div>
      <div style="font-size:0.78rem; color:#D1FAE5; margin-top:2px;">Vous êtes à nouveau connecté.</div>
    </div>
    <button type="button" onclick="this.parentElement.remove()" style="background:none; border:none; color:#A7F3D0; font-size:1.1rem; cursor:pointer; padding:0; line-height:1;">&times;</button>
  `;

  document.body.appendChild(bubble);

  // Disparaît automatiquement après 4 secondes
  setTimeout(() => {
    bubble.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    bubble.style.opacity = '0';
    bubble.style.transform = 'translateY(10px)';
    setTimeout(() => bubble.remove(), 400);
  }, 4000);
};

// Listeners
window.showOfflineBanner = window.showOfflineModal;
window.addEventListener('offline', window.showOfflineModal);
window.addEventListener('online', window.showOnlineToast);

// ── BULLE NOTIFICATION DE CONFIRMATION SOLITIQUO (TOAST ÉLÉGANT) ──
window.showSolitiquoToast = function(message, isWarning = false) {
  const existing = document.getElementById('solitiquo-toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'solitiquo-toast-notification';
  toast.style.cssText = `
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    z-index: 999999;
    background: rgba(55, 70, 61, 0.96);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    color: #F8FBF1;
    padding: 14px 24px;
    border-radius: 30px;
    border: 1px solid ${isWarning ? 'rgba(200, 40, 35, 0.4)' : 'rgba(201, 162, 39, 0.4)'};
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
    font-family: Inter, system-ui, -apple-system, sans-serif;
    font-size: 0.9rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 10px;
    opacity: 0;
    transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  const iconSvg = isWarning
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;

  toast.innerHTML = `${iconSvg} <span>${message}</span>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
};

// ── BULLES DE DIALOGUE DÉDIÉES AU TÉLÉCHARGEMENT DES PODCASTS ──

window.showPodcastDownloadToast = function(message, isSuccess = true, linkUrl = 'profil.html?tab=downloads', linkText = 'Voir mes téléchargements →') {
  const existing = document.getElementById('podcast-download-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'podcast-download-toast';
  toast.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 30px;
    z-index: 999999;
    max-width: 380px;
    width: calc(100% - 48px);
    background: rgba(30, 41, 35, 0.95);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    color: #F8FBF1;
    padding: 18px 20px;
    border-radius: 20px;
    border: 1px solid ${isSuccess ? 'rgba(201, 162, 39, 0.4)' : 'rgba(239, 68, 68, 0.4)'};
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
    font-family: Inter, system-ui, -apple-system, sans-serif;
    animation: podToastSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  if (!document.getElementById('pod-toast-anim')) {
    const style = document.createElement('style');
    style.id = 'pod-toast-anim';
    style.textContent = `
      @keyframes podToastSlideIn {
        from { opacity: 0; transform: translateY(20px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  toast.innerHTML = `
    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px;">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:36px; height:36px; border-radius:50%; background:${isSuccess ? 'rgba(201, 162, 39, 0.15)' : 'rgba(239, 68, 68, 0.15)'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${isSuccess ? '#C9A227' : '#EF4444'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
        <div>
          <strong style="font-size:0.95rem; font-weight:700; color:#FFF; font-family:'Playfair Display', serif;">Podcast Solitiquo</strong>
          <p style="margin:2px 0 0 0; font-size:0.83rem; color:#CBD5E1; line-height:1.4;">${message}</p>
        </div>
      </div>
      <button type="button" onclick="this.closest('#podcast-download-toast').remove()" style="background:none; border:none; color:#94A3B8; font-size:1.2rem; cursor:pointer; padding:0; line-height:1;">&times;</button>
    </div>
    ${isSuccess ? `
      <a href="${linkUrl}" style="display:inline-flex; align-items:center; gap:6px; margin-top:12px; font-size:0.82rem; font-weight:700; color:#C9A227; text-decoration:none; transition:opacity 0.2s;">
        ${linkText}
      </a>
    ` : ''}
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 400);
  }, 4500);
};

window.showPodcastPremiumModal = function() {
  const existing = document.getElementById('pod-premium-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'pod-premium-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(55, 70, 61, 0.6);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    animation: podModalFade 0.3s ease;
    padding: 20px;
  `;

  const box = document.createElement('div');
  box.style.cssText = `
    max-width: 420px;
    width: 100%;
    background: #FFFFFF;
    border-radius: 24px;
    padding: 32px 28px;
    text-align: center;
    border: 1px solid rgba(55, 70, 61, 0.12);
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.28);
    font-family: Inter, system-ui, -apple-system, sans-serif;
  `;

  box.innerHTML = `
    <div style="width:64px; height:64px; margin:0 auto 18px auto; background:rgba(200, 40, 35, 0.08); border-radius:50%; display:flex; align-items:center; justify-content:center;">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#C82823" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    </div>
    <h3 style="font-family:'Playfair Display', Georgia, serif; font-size:1.5rem; font-weight:700; color:#37463D; margin-bottom:10px; line-height:1.2;">
      Téléchargement des Podcasts 🔒
    </h3>
    <p style="font-size:0.9rem; color:#475569; line-height:1.6; margin-bottom:24px;">
      La sauvegarde et l'écoute hors-ligne de nos émissions audio sont réservées aux abonnés Premium Solitiquo.
    </p>
    <a href="abonnement.html" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; background:#C82823; color:#FFFFFF; border:none; padding:13px 24px; border-radius:30px; font-weight:700; font-size:0.95rem; text-decoration:none; box-shadow:0 4px 16px rgba(200, 40, 35, 0.25); transition:all 0.2s;">
      S'abonner au Premium →
    </a>
    <button type="button" onclick="document.getElementById('pod-premium-modal-overlay')?.remove()" style="margin-top:14px; background:none; border:none; color:#94A3B8; font-size:0.85rem; font-weight:600; cursor:pointer; text-decoration:underline;">
      Fermer cette fenêtre
    </button>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);
};

// ── BULLE DE CONSENTEMENT DE TÉLÉCHARGEMENT SOLITIQUO ──
window.confirmDownloadModal = function({ title = '', type = 'podcast', onConfirm }) {
  const existing = document.getElementById('dl-consent-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'dl-consent-modal-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(55, 70, 61, 0.6);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    animation: dlConsentFade 0.25s ease;
    padding: 20px;
  `;

  if (!document.getElementById('dl-consent-anim')) {
    const style = document.createElement('style');
    style.id = 'dl-consent-anim';
    style.textContent = `
      @keyframes dlConsentFade {
        from { opacity: 0; transform: scale(0.97); }
        to { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  const box = document.createElement('div');
  box.style.cssText = `
    max-width: 420px;
    width: 100%;
    background: #FFFFFF;
    border-radius: 24px;
    padding: 30px 26px;
    text-align: center;
    border: 1px solid rgba(55, 70, 61, 0.12);
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.28);
    font-family: Inter, system-ui, -apple-system, sans-serif;
  `;

  const isPodcast = type === 'podcast';
  const typeLabel = isPodcast ? 'ce podcast' : 'cet article';

  box.innerHTML = `
    <div style="width:60px; height:60px; margin:0 auto 16px auto; background:rgba(201, 162, 39, 0.12); border-radius:50%; display:flex; align-items:center; justify-content:center;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
    </div>
    <h3 style="font-family:'Playfair Display', Georgia, serif; font-size:1.45rem; font-weight:700; color:#37463D; margin-bottom:10px; line-height:1.25;">
      Télécharger ${typeLabel} ?
    </h3>
    <p style="font-size:0.9rem; color:#475569; line-height:1.55; margin-bottom:22px;">
      Souhaitez-vous enregistrer <strong>« ${title} »</strong> pour la consultation hors-connexion dans votre application Solitiquo ?
    </p>
    <div style="display:flex; flex-direction:column; gap:10px;">
      <button type="button" id="btn-consent-confirm" style="width:100%; background:#37463D; color:#FFFFFF; border:none; padding:13px 20px; border-radius:30px; font-weight:700; font-size:0.95rem; cursor:pointer; box-shadow:0 4px 16px rgba(55, 70, 61, 0.25); transition:all 0.2s;">
        Confirmer le téléchargement
      </button>
      <button type="button" onclick="document.getElementById('dl-consent-modal-overlay')?.remove()" style="width:100%; background:transparent; color:#64748B; border:none; padding:10px 20px; font-weight:600; font-size:0.88rem; cursor:pointer; text-decoration:underline;">
        Annuler
      </button>
    </div>
  `;

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById('btn-consent-confirm').addEventListener('click', () => {
    overlay.remove();
    if (typeof onConfirm === 'function') onConfirm();
  });
};

// ── ANALYTICS DE LECTURE & SUIVI DES VUES ──
window.initAnalytics = function(articleId) {
  if (!articleId) return;

  const trackedMilestones = new Set();

  const sendTrack = (milestone) => {
    if (trackedMilestones.has(milestone)) return;
    trackedMilestones.add(milestone);

    fetch(`${window.API_URL || (window.location.origin + '/api')}/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ article_id: articleId, milestone: String(milestone) })
    }).catch(err => console.error('❌ Erreur Analytics track:', err));
  };

  // 1. Envoyer immédiatement le milestone 'start' (incrémente views_count et reads_start)
  sendTrack('start');

  // 2. Suivi précis du défilement réel de l'article
  const setupScrollTracking = () => {
    const handleScroll = () => {
      const targetEl = document.getElementById('article-content') || document.querySelector('.article-body') || document.body;
      const rect = targetEl.getBoundingClientRect();
      const elementHeight = targetEl.offsetHeight;

      let scrollPercent = 0;
      if (elementHeight > 500) {
        // Calcul de la progression dans l'article principal
        const scrolledDistance = window.innerHeight - rect.top;
        scrollPercent = Math.max(0, Math.min(100, (scrolledDistance / elementHeight) * 100));
      } else {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight > 100) {
          scrollPercent = (window.scrollY / docHeight) * 100;
        }
      }

      // Seuls les défilements réellement effectifs déclenchent les jalons de rétention
      if (scrollPercent >= 25) sendTrack('25');
      if (scrollPercent >= 50) sendTrack('50');
      if (scrollPercent >= 75) sendTrack('75');
      if (scrollPercent >= 92) {
        sendTrack('100');
        window.removeEventListener('scroll', handleScroll);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    setTimeout(handleScroll, 800);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupScrollTracking);
  } else {
    setTimeout(setupScrollTracking, 400);
  }
};

if (typeof navigator !== 'undefined' && !navigator.onLine) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.showOfflineModal);
  } else {
    window.showOfflineModal();
  }
}