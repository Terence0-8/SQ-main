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
      dashBtn.innerHTML = "⚙️ Dashboard";
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

// ── DÉTECTION & BANNIÈRE MODE HORS-LIGNE ──
window.showOfflineBanner = function() {
  if (document.getElementById('offline-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.innerHTML = `
    <div style="background:#1E293B; color:#F8FAFC; padding:10px 16px; text-align:center; font-size:0.88rem; font-weight:600; display:flex; align-items:center; justify-content:center; gap:10px; position:sticky; top:0; z-index:99999; box-shadow:0 4px 12px rgba(0,0,0,0.15);">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2.5"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
      <span>Mode Hors-ligne activé — Consultation des données locales et téléchargées.</span>
      <a href="profil.html" style="color:#F59E0B; text-decoration:underline; font-weight:700; margin-left:6px;">Voir mes téléchargements →</a>
    </div>
  `;
  document.body.prepend(banner);
};

window.addEventListener('offline', window.showOfflineBanner);
if (typeof navigator !== 'undefined' && !navigator.onLine) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.showOfflineBanner);
  } else {
    window.showOfflineBanner();
  }
}