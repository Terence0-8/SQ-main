// URL API dynamique (configurée par config.js ou fallback)
var API_URL = window.API_URL || (window.location.origin + '/api');

const SolitiquoAPI = {
  // --- ARTICLES ---
  getArticles: async (filters = '') => {
    try {
      const query = filters.startsWith('?') ? filters : '';
      const response = await fetch(`${API_URL}/articles${query}`);
      if (!response.ok) throw new Error('Erreur réseau');
      const json = await response.json();
      return json.data || [];
    } catch (error) { console.error("Err articles:", error); return []; }
  },

  getArticleById: async (id) => {
    try {
      const response = await fetch(`${API_URL}/articles/${id}`);
      if (!response.ok) throw new Error('Introuvable');
      const json = await response.json();
      return json.article;
    } catch (error) { console.error("Err article:", error); return null; }
  },

  formatDate: (dateString) => {
    if (!dateString) return '';
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return new Date(dateString).toLocaleDateString('fr-FR', options);
  },

  // --- PODCASTS ---
  getPodcasts: async () => {
    try {
      const response = await fetch(`${API_URL}/podcasts`);
      if (!response.ok) throw new Error('Erreur réseau');
      const json = await response.json();
      return json.data || [];
    } catch (error) { console.error("Err podcasts:", error); return []; }
  },

  getPodcastById: async (id) => {
    try {
      const response = await fetch(`${API_URL}/podcasts/${id}`);
      if (!response.ok) throw new Error('Introuvable');
      const json = await response.json();
      return json.podcast;
    } catch (error) { return null; }
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
      localStorage.clear(); // Nettoyage complet du localStorage
      window.location.href = 'index.html';
    } catch (e) { console.error(e); }
  },

  getProfile: async () => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, { credentials: 'include' });
      const json = await res.json();
      return json.success && json.isLoggedIn ? json.user : null;
    } catch (e) { return null; }
  },

  // --- UI MANAGEMENT (Cerveau Interface) ---
  initUserInterface: async () => {
    const user = await SolitiquoAPI.getProfile();
    const authBtns = document.querySelectorAll('.ph-btn-auth, .mobile-auth a');

    if (user) {
      // 1. Changer le bouton connexion
      authBtns.forEach(btn => {
        btn.innerHTML = `👤 ${user.username}`;
        btn.href = "#";
        btn.style.backgroundColor = "#f0f0f0";
        btn.style.color = "#37463D";
        btn.style.border = "1px solid #ddd";


        // Modification du comportement au clic
        btn.onclick = (e) => {
          e.preventDefault();
          // Redirection vers la page profil au lieu de déconnecter direct
          window.location.href = "profil.html";
        };
      });

      // 2. SI ADMIN : Ajouter le bouton Dashboard
      if (user.role === 'admin' || user.role === 'writer') {
        document.body.classList.add('is-admin');

        // Création du bouton Dashboard dans le header
        const nav = document.querySelector('.ph-right'); // Zone droite du header
        if (nav) {
          const dashBtn = document.createElement('a');
          dashBtn.href = "admin.html";
          dashBtn.className = "ph-btn-auth"; // Même style
          dashBtn.innerHTML = "⚙️ Dashboard";
          dashBtn.style.marginRight = "10px";
          dashBtn.style.backgroundColor = "#37463D";
          dashBtn.style.color = "white";

          // Insérer avant le bouton profil
          const profileBtn = nav.querySelector('.ph-btn-auth');
          nav.insertBefore(dashBtn, profileBtn);
        }
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
  // Si l'utilisateur n'est pas connecté, le bouton auth doit être retraduit
  // (quand connecté, le texte est remplacé par le nom d'utilisateur — pas besoin de retraduire)
  const authBtns = document.querySelectorAll('.ph-btn-auth');
  authBtns.forEach(btn => {
    // Seulement si le bouton pointe encore vers auth.html (= utilisateur non connecté)
    if (btn.href && btn.href.includes('auth.html')) {
      btn.textContent = lang === 'en' ? 'Sign in' : "S'identifier";
    }
  });
});