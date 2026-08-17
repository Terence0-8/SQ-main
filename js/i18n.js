// ============================================================
// SYSTÈME DE TRADUCTION BILINGUE FR/EN - COMPLET
// Couvre 100% du contenu du site
// ============================================================

var TRANSLATIONS = {
  fr: {
    // ==================== NAVIGATION ====================
    nav_pol: 'Politique',
    nav_soc: 'Social',
    nav_parties: 'Partis',
    nav_shows: 'Émissions',
    nav_podcasts: 'Podcasts',
    nav_search: 'Rechercher',
    nav_profile: 'Profil',
    nav_logout: 'Déconnexion',
    nav_login: 'S\'identifier',
    nav_home: 'Accueil',
    nav_admin: 'Administration',

    // ==================== SECTIONS HOMEPAGE ====================
    section_essentiel: 'L\'Essentiel de l\'info',
    section_obs: 'L\'Observatoire',
    section_discover: 'À Découvrir',
    section_trending: 'Tendances',
    section_latest: 'Dernières actualités',
    section_analysis: 'Analyses',

    // ==================== RECHERCHE ====================
    search_placeholder: 'Rechercher...',
    search_label: 'Rechercher',
    search_results: 'résultats',
    search_no_results: 'Aucun résultat trouvé',
    search_in_progress: 'Recherche en cours...',

    // ==================== BADGES ====================
    badge_une: 'À LA UNE',
    badge_poll: 'SONDAGE',
    badge_premium: 'PREMIUM',
    badge_breaking: 'FLASH INFO',
    badge_analysis: 'ANALYSE',
    badge_exclusive: 'EXCLUSIF',
    badge_french_only: 'Français uniquement',
    badge_english_only: 'Anglais uniquement',

    // ==================== ACTIONS ====================
    btn_read: 'Lire l\'article',
    btn_read_more: 'Lire la suite',
    btn_listen: 'Écouter',
    btn_watch: 'Regarder',
    btn_vote: 'Voter',
    btn_subscribe: 'S\'abonner',
    btn_share: 'Partager',
    btn_comment: 'Commenter',
    btn_save: 'Enregistrer',
    btn_cancel: 'Annuler',
    btn_submit: 'Envoyer',
    btn_edit: 'Modifier',
    btn_delete: 'Supprimer',
    btn_translate: 'Traduire en anglais',
    btn_back: 'Retour',
    btn_next: 'Suivant',
    btn_previous: 'Précédent',

    // ==================== SONDAGES ====================
    poll_title: 'Sondage',
    poll_question: 'Question',
    poll_vote_btn: 'Voter',
    poll_results: 'Résultats',
    poll_votes: 'votes',
    poll_total_votes: 'Total des votes',
    poll_already_voted: 'Vous avez déjà voté',
    poll_login_required: 'Connexion requise pour voter',
    poll_expired: 'Ce sondage est terminé',
    poll_ends_in: 'Se termine dans',
    poll_ended: 'Terminé',
    poll_vote_success: 'Vote enregistré avec succès',
    poll_vote_error: 'Erreur lors du vote',

    // ==================== ARTICLES ====================
    article_by: 'Par',
    article_published: 'Publié le',
    article_updated: 'Mis à jour le',
    article_reading_time: 'min de lecture',
    article_views: 'vues',
    article_share_on: 'Partager sur',
    article_related: 'Articles liés',
    article_tags: 'Étiquettes',
    article_category: 'Catégorie',
    article_premium_only: 'Article réservé aux abonnés',
    article_translation_available: 'Version anglaise disponible',
    article_no_translation: 'Pas encore traduit',

    // ==================== COMMENTAIRES ====================
    comment_title: 'Commentaires',
    comment_add: 'Ajouter un commentaire',
    comment_reply: 'Répondre',
    comment_edit: 'Modifier',
    comment_delete: 'Supprimer',
    comment_login_required: 'Connectez-vous pour commenter',
    comment_pending: 'En attente de modération',
    comment_deleted: 'Commentaire supprimé',
    comment_no_comments: 'Aucun commentaire pour le moment',

    // ==================== PODCASTS ====================
    podcast_duration: 'Durée',
    podcast_play: 'Lire',
    podcast_pause: 'Pause',
    podcast_download: 'Télécharger',
    podcast_transcript: 'Transcription',
    podcast_episode: 'Épisode',
    podcast_season: 'Saison',
    podcast_latest_episodes: 'Derniers épisodes',

    // ==================== ÉMISSIONS ====================
    show_watch_now: 'Regarder maintenant',
    show_aired_on: 'Diffusé le',
    show_duration: 'Durée',
    show_host: 'Présentateur',
    show_guests: 'Invités',

    // ==================== PARTIS POLITIQUES ====================
    party_leader: 'Président',
    party_founded: 'Fondé en',
    party_ideology: 'Idéologie',
    party_website: 'Site web',
    party_social: 'Réseaux sociaux',
    party_contact: 'Contact',
    party_program: 'Programme',
    party_members: 'Membres',
    party_description: 'Description',

    // ==================== AUTHENTIFICATION ====================
    auth_login: 'Connexion',
    auth_register: 'Inscription',
    auth_logout: 'Déconnexion',
    auth_email: 'Email',
    auth_password: 'Mot de passe',
    auth_confirm_password: 'Confirmer le mot de passe',
    auth_username: 'Nom d\'utilisateur',
    auth_forgot_password: 'Mot de passe oublié ?',
    auth_remember_me: 'Se souvenir de moi',
    auth_login_success: 'Connexion réussie',
    auth_login_error: 'Email ou mot de passe incorrect',
    auth_register_success: 'Inscription réussie',
    auth_logout_success: 'Déconnexion réussie',

    // ==================== ABONNEMENT ====================
    sub_title: 'Abonnement Premium',
    sub_monthly: 'Mensuel',
    sub_yearly: 'Annuel',
    sub_price_month: 'mois',
    sub_price_year: 'an',
    sub_current_plan: 'Votre abonnement actuel',
    sub_expires_on: 'Expire le',
    sub_renews_on: 'Se renouvelle le',
    sub_cancel: 'Annuler l\'abonnement',
    sub_upgrade: 'Passer à Premium',
    sub_benefits: 'Avantages',
    sub_unlimited_access: 'Accès illimité',
    sub_no_ads: 'Sans publicité',
    sub_exclusive_content: 'Contenus exclusifs',

    // ==================== FORMULAIRES ====================
    form_required: 'Champ obligatoire',
    form_invalid_email: 'Email invalide',
    form_password_short: 'Mot de passe trop court',
    form_passwords_mismatch: 'Les mots de passe ne correspondent pas',
    form_success: 'Envoyé avec succès',
    form_error: 'Erreur lors de l\'envoi',

    // ==================== MESSAGES ====================
    msg_loading: 'Chargement...',
    msg_error: 'Une erreur est survenue',
    msg_success: 'Opération réussie',
    msg_no_data: 'Aucune donnée disponible',
    msg_confirm_delete: 'Êtes-vous sûr de vouloir supprimer ?',
    msg_unsaved_changes: 'Modifications non enregistrées',
    msg_network_error: 'Erreur de connexion',
    msg_premium_required: 'Abonnement Premium requis',

    // ==================== DATES & TEMPS ====================
    time_now: 'à l\'instant',
    time_minutes_ago: 'il y a {{n}} min',
    time_hours_ago: 'il y a {{n}}h',
    time_days_ago: 'il y a {{n}} jours',
    time_weeks_ago: 'il y a {{n}} semaines',
    time_months_ago: 'il y a {{n}} mois',
    time_years_ago: 'il y a {{n}} ans',

    // ==================== FOOTER ====================
    footer_rubriques: 'Rubriques',
    footer_legal: 'Légal',
    footer_contact: 'Contact',
    footer_about: 'À propos',
    footer_terms: 'Conditions d\'utilisation',
    footer_privacy: 'Politique de confidentialité',
    footer_cookies: 'Cookies',
    footer_copyright: 'Tous droits réservés',
    footer_follow_us: 'Suivez-nous',

    // ==================== CATÉGORIES ====================
    category_politique: 'Politique',
    category_social: 'Social',
    category_economie: 'Économie',
    category_culture: 'Culture',
    category_international: 'International',
    category_sport: 'Sport',
    category_dossiers: 'Dossiers',

    // ==================== PAYWALL (article.html) ====================
    paywall_title: 'Lecture réservée aux abonnés',
    paywall_subtitle: 'Soutenez une information indépendante et accédez à l\'intégralité de nos contenus.',
    paywall_cta_prefix: 'S\'abonner dès',
    paywall_already: 'Déjà abonné ?',
    paywall_login_link: 'Connectez-vous',
    paywall_features_title: 'Inclus dans votre offre :',
    paywall_feature_noad: 'Zéro publicité',
    paywall_feature_unlimited: 'Accès illimité aux contenus',
    paywall_feature_exclu: 'Enquêtes et analyses exclusives',
    paywall_feature_podcasts: 'Podcasts exclusifs',
    paywall_feature_newsletter: 'Newsletter exclusive',
    paywall_feature_pdf: 'Téléchargement PDF',

    // ==================== PAIEMENT (paiement.html) ====================
    payment_title: 'Sécuriser votre abonnement',
    payment_subtitle: 'Accédez à l\'intégralité de nos analyses.',
    payment_summary_title: 'Récapitulatif',
    payment_taxes: 'Taxes & Frais',
    payment_total: 'Total à payer',
    payment_included_title: 'Inclus dans votre offre :',
    payment_feature_articles: 'Articles illimités',
    payment_feature_podcasts_excl: 'Podcasts exclusifs',
    payment_feature_archives: 'Accès aux archives',
    payment_feature_noad: 'Zéro publicité',
    payment_feature_newsletter: 'Newsletter exclusive',
    payment_secure_note: 'Paiement sécurisé. Aucune donnée bancaire n\'est stockée par Solitiquo.',
    payment_cinetpay_note: 'En cliquant, vous serez redirigé vers le guichet sécurisé CinetPay. Aucune donnée bancaire n\'est stockée par Solitiquo.',
    payment_cancelled: 'Paiement annulé. Vous pouvez réessayer quand vous voulez.',
    payment_not_logged_in: 'Vous devez être connecté pour accéder au paiement.',
    payment_plan_monthly: 'Offre Mensuelle',
    payment_plan_yearly: 'Offre Annuelle',
    payment_cta: 'Confirmer et payer',
    payment_processing: 'Traitement en cours…',
    payment_retry: 'Réessayer',
    payment_init: 'Initialisation…',
    payment_loading: 'Chargement des options de paiement…',

    // ==================== ABONNEMENT (abonnement.html) ====================
    sub_hero_title: 'Soutenez une information libre',
    sub_hero_desc: 'Accédez à nos enquêtes exclusives, profitez d\'une lecture sans publicité et participez aux débats réservés à nos abonnés.',
    sub_plan_decouverte: 'Découverte',
    sub_plan_engage: 'Engagé',
    sub_plan_soutien: 'Soutien',
    sub_limited_access: 'Accès limité',
    sub_per_month: 'Par mois, sans engagement',
    sub_per_year: 'Par an (2 mois offerts)',
    sub_feature_articles: 'Articles d\'actualité',
    sub_feature_podcasts_basic: 'Podcasts (audio simple)',
    sub_feature_ads: 'Publicités activées',
    sub_feature_no_exclu: 'Enquêtes exclusives',
    sub_feature_noad: 'Zéro publicité',
    sub_feature_enquetes: 'Accès illimité aux enquêtes',
    sub_feature_comments: 'Commentaires prioritaires',
    sub_feature_newsletter: 'Newsletter exclusive',
    sub_feature_badge: 'Badge "Soutien" sur le profil',
    sub_feature_events: 'Invitations aux événements',
    sub_feature_all_engaged: 'Tous les avantages "Engagé"',
    sub_most_popular: 'LE PLUS POPULAIRE',
    sub_btn_create: 'Créer un compte',
    sub_btn_subscribe: 'Je m\'abonne',
    sub_btn_yearly: 'Choisir l\'annuel'
  },

  en: {
    // ==================== NAVIGATION ====================
    nav_pol: 'Politics',
    nav_soc: 'Social',
    nav_parties: 'Parties',
    nav_shows: 'Shows',
    nav_podcasts: 'Podcasts',
    nav_search: 'Search',
    nav_profile: 'Profile',
    nav_logout: 'Logout',
    nav_login: 'Sign in',
    nav_home: 'Home',
    nav_admin: 'Administration',

    // ==================== SECTIONS HOMEPAGE ====================
    section_essentiel: 'Essential News',
    section_obs: 'Observatory',
    section_discover: 'Discover',
    section_trending: 'Trending',
    section_latest: 'Latest News',
    section_analysis: 'Analysis',

    // ==================== SEARCH ====================
    search_placeholder: 'Search...',
    search_label: 'Search',
    search_results: 'results',
    search_no_results: 'No results found',
    search_in_progress: 'Searching...',

    // ==================== BADGES ====================
    badge_une: 'TOP STORY',
    badge_poll: 'POLL',
    badge_premium: 'PREMIUM',
    badge_breaking: 'BREAKING NEWS',
    badge_analysis: 'ANALYSIS',
    badge_exclusive: 'EXCLUSIVE',
    badge_french_only: 'French only',
    badge_english_only: 'English only',

    // ==================== ACTIONS ====================
    btn_read: 'Read article',
    btn_read_more: 'Read more',
    btn_listen: 'Listen',
    btn_watch: 'Watch',
    btn_vote: 'Vote',
    btn_subscribe: 'Subscribe',
    btn_share: 'Share',
    btn_comment: 'Comment',
    btn_save: 'Save',
    btn_cancel: 'Cancel',
    btn_submit: 'Submit',
    btn_edit: 'Edit',
    btn_delete: 'Delete',
    btn_translate: 'Translate to French',
    btn_back: 'Back',
    btn_next: 'Next',
    btn_previous: 'Previous',

    // ==================== POLLS ====================
    poll_title: 'Poll',
    poll_question: 'Question',
    poll_vote_btn: 'Vote',
    poll_results: 'Results',
    poll_votes: 'votes',
    poll_total_votes: 'Total votes',
    poll_already_voted: 'You already voted',
    poll_login_required: 'Login required to vote',
    poll_expired: 'This poll has ended',
    poll_ends_in: 'Ends in',
    poll_ended: 'Ended',
    poll_vote_success: 'Vote recorded successfully',
    poll_vote_error: 'Error while voting',

    // ==================== ARTICLES ====================
    article_by: 'By',
    article_published: 'Published on',
    article_updated: 'Updated on',
    article_reading_time: 'min read',
    article_views: 'views',
    article_share_on: 'Share on',
    article_related: 'Related articles',
    article_tags: 'Tags',
    article_category: 'Category',
    article_premium_only: 'Subscribers only',
    article_translation_available: 'French version available',
    article_no_translation: 'Not yet translated',

    // ==================== COMMENTS ====================
    comment_title: 'Comments',
    comment_add: 'Add a comment',
    comment_reply: 'Reply',
    comment_edit: 'Edit',
    comment_delete: 'Delete',
    comment_login_required: 'Login to comment',
    comment_pending: 'Pending moderation',
    comment_deleted: 'Comment deleted',
    comment_no_comments: 'No comments yet',

    // ==================== PODCASTS ====================
    podcast_duration: 'Duration',
    podcast_play: 'Play',
    podcast_pause: 'Pause',
    podcast_download: 'Download',
    podcast_transcript: 'Transcript',
    podcast_episode: 'Episode',
    podcast_season: 'Season',
    podcast_latest_episodes: 'Latest episodes',

    // ==================== SHOWS ====================
    show_watch_now: 'Watch now',
    show_aired_on: 'Aired on',
    show_duration: 'Duration',
    show_host: 'Host',
    show_guests: 'Guests',

    // ==================== POLITICAL PARTIES ====================
    party_leader: 'Leader',
    party_founded: 'Founded in',
    party_ideology: 'Ideology',
    party_website: 'Website',
    party_social: 'Social media',
    party_contact: 'Contact',
    party_program: 'Program',
    party_members: 'Members',
    party_description: 'Description',

    // ==================== AUTHENTICATION ====================
    auth_login: 'Login',
    auth_register: 'Register',
    auth_logout: 'Logout',
    auth_email: 'Email',
    auth_password: 'Password',
    auth_confirm_password: 'Confirm password',
    auth_username: 'Username',
    auth_forgot_password: 'Forgot password?',
    auth_remember_me: 'Remember me',
    auth_login_success: 'Login successful',
    auth_login_error: 'Invalid email or password',
    auth_register_success: 'Registration successful',
    auth_logout_success: 'Logout successful',

    // ==================== SUBSCRIPTION ====================
    sub_title: 'Premium Subscription',
    sub_monthly: 'Monthly',
    sub_yearly: 'Yearly',
    sub_price_month: 'month',
    sub_price_year: 'year',
    sub_current_plan: 'Your current plan',
    sub_expires_on: 'Expires on',
    sub_renews_on: 'Renews on',
    sub_cancel: 'Cancel subscription',
    sub_upgrade: 'Upgrade to Premium',
    sub_benefits: 'Benefits',
    sub_unlimited_access: 'Unlimited access',
    sub_no_ads: 'Ad-free',
    sub_exclusive_content: 'Exclusive content',

    // ==================== FORMS ====================
    form_required: 'Required field',
    form_invalid_email: 'Invalid email',
    form_password_short: 'Password too short',
    form_passwords_mismatch: 'Passwords do not match',
    form_success: 'Sent successfully',
    form_error: 'Error while sending',

    // ==================== MESSAGES ====================
    msg_loading: 'Loading...',
    msg_error: 'An error occurred',
    msg_success: 'Operation successful',
    msg_no_data: 'No data available',
    msg_confirm_delete: 'Are you sure you want to delete?',
    msg_unsaved_changes: 'Unsaved changes',
    msg_network_error: 'Connection error',
    msg_premium_required: 'Premium subscription required',

    // ==================== DATES & TIME ====================
    time_now: 'just now',
    time_minutes_ago: '{{n}} min ago',
    time_hours_ago: '{{n}}h ago',
    time_days_ago: '{{n}} days ago',
    time_weeks_ago: '{{n}} weeks ago',
    time_months_ago: '{{n}} months ago',
    time_years_ago: '{{n}} years ago',

    // ==================== FOOTER ====================
    footer_rubriques: 'Categories',
    footer_legal: 'Legal',
    footer_contact: 'Contact',
    footer_about: 'About',
    footer_terms: 'Terms of use',
    footer_privacy: 'Privacy policy',
    footer_cookies: 'Cookies',
    footer_copyright: 'All rights reserved',
    footer_follow_us: 'Follow us',

    // ==================== CATEGORIES ====================
    category_politique: 'Politics',
    category_social: 'Social',
    category_economie: 'Economy',
    category_culture: 'Culture',
    category_international: 'International',
    category_sport: 'Sport',
    category_dossiers: 'Dossiers',

    // ==================== PAYWALL (article.html) ====================
    paywall_title: 'Subscribers only',
    paywall_subtitle: 'Support independent journalism and access all our content.',
    paywall_cta_prefix: 'Subscribe from',
    paywall_already: 'Already subscribed?',
    paywall_login_link: 'Log in',
    paywall_features_title: "What's included:",
    paywall_feature_noad: 'Ad-free experience',
    paywall_feature_unlimited: 'Unlimited content access',
    paywall_feature_exclu: 'Exclusive investigations & analyses',
    paywall_feature_podcasts: 'Exclusive podcasts',
    paywall_feature_newsletter: 'Exclusive newsletter',
    paywall_feature_pdf: 'PDF download',

    // ==================== PAYMENT (paiement.html) ====================
    payment_title: 'Secure your subscription',
    payment_subtitle: 'Access all our analyses.',
    payment_summary_title: 'Order Summary',
    payment_taxes: 'Taxes & Fees',
    payment_total: 'Total',
    payment_included_title: "What's included:",
    payment_feature_articles: 'Unlimited articles',
    payment_feature_podcasts_excl: 'Exclusive podcasts',
    payment_feature_archives: 'Archive access',
    payment_feature_noad: 'Ad-free',
    payment_feature_newsletter: 'Exclusive newsletter',
    payment_secure_note: 'Secure payment. No banking data is stored by Solitiquo.',
    payment_cinetpay_note: "By clicking, you'll be redirected to the secure CinetPay payment page. No banking data is stored by Solitiquo.",
    payment_cancelled: 'Payment cancelled. You can try again anytime.',
    payment_not_logged_in: 'You must be logged in to access payment.',
    payment_plan_monthly: 'Monthly Plan',
    payment_plan_yearly: 'Annual Plan',
    payment_cta: 'Confirm and pay',
    payment_processing: 'Processing…',
    payment_retry: 'Try again',
    payment_init: 'Initializing…',
    payment_loading: 'Loading payment options…',

    // ==================== SUBSCRIPTION (abonnement.html) ====================
    sub_hero_title: 'Support free journalism',
    sub_hero_desc: 'Access our exclusive investigations, enjoy an ad-free reading experience and participate in debates reserved for our subscribers.',
    sub_plan_decouverte: 'Discovery',
    sub_plan_engage: 'Engaged',
    sub_plan_soutien: 'Supporter',
    sub_limited_access: 'Limited access',
    sub_per_month: 'Per month, no commitment',
    sub_per_year: 'Per year (2 months free)',
    sub_feature_articles: 'News articles',
    sub_feature_podcasts_basic: 'Podcasts (basic audio)',
    sub_feature_ads: 'Ads enabled',
    sub_feature_no_exclu: 'Exclusive investigations',
    sub_feature_noad: 'Ad-free',
    sub_feature_enquetes: 'Unlimited access to investigations',
    sub_feature_comments: 'Priority comments',
    sub_feature_newsletter: 'Exclusive newsletter',
    sub_feature_badge: '"Supporter" badge on profile',
    sub_feature_events: 'Event invitations',
    sub_feature_all_engaged: 'All "Engaged" benefits',
    sub_most_popular: 'MOST POPULAR',
    sub_btn_create: 'Create an account',
    sub_btn_subscribe: 'Subscribe',
    sub_btn_yearly: 'Choose annual'
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
    } else {
      console.warn('⚠️ Le serveur n\'a pas pu sauvegarder la préférence');
    }
  } catch (error) {
    console.warn('⚠️ Impossible de synchroniser avec le serveur (mode hors ligne)');
    // Pas grave : localStorage suffit pour la persistance locale
  }
}

/**
 * Charge la préférence de langue depuis le backend
 * Utilisé au chargement initial de la page si localStorage est vide
 * @returns {Promise<string>} La langue préférée ('fr' ou 'en')
 */
async function loadLanguagePreference() {
  // 🔥 PRIORITÉ 1 : localStorage (source de vérité côté client)
  const cachedLang = localStorage.getItem('siteLanguage');
  if (cachedLang) {
    console.log(`✅ Langue chargée depuis localStorage: ${cachedLang}`);
    return cachedLang;
  }

  // PRIORITÉ 2 : Backend (seulement si localStorage vide)
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

  // PRIORITÉ 3 : Fallback français
  return 'fr';
}

/**
 * Traduit une clé avec support des variables {{n}}
 * @param {string} key - Clé de traduction
 * @param {Object} vars - Variables à remplacer (ex: {n: 5})
 * @returns {string} Texte traduit
 */
function t(key, vars = {}) {
  const lang = getLanguage();
  let text = TRANSLATIONS[lang][key] || key;

  // Remplacer les variables {{n}}, {{name}}, etc.
  Object.keys(vars).forEach(varKey => {
    text = text.replace(`{{${varKey}}}`, vars[varKey]);
  });

  return text;
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
      // Si c'est un input/textarea, mettre à jour le placeholder
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.placeholder = translations[key];
      } else {
        element.textContent = translations[key];
      }
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
 * 🌍 NOUVEAUTÉ: Affiche TOUS les articles avec badge si pas de traduction
 * @param {string} lang - Langue des articles à charger
 */
async function loadArticles(lang) {
  try {
    const res = await fetch(API_URL + '/articles?lang=' + lang);
    const json = await res.json();

    if (json.success && json.data.length > 0) {
      // 📌 Limite la page d'accueil aux 25 articles les plus récents
      const articles = json.data.slice(0, 25);

      console.log(`📰 ${articles.length} articles chargés (langue préférée: ${lang})`);

      // 1. HERO (Article 0)
      const une = articles[0];
      const linkUne = `article.html?id=${une.id}`;
      const uneImg = une.image_url || 'https://via.placeholder.com/1600x900';

      // Badge langue si article pas dans langue active
      const langBadge = une.language !== lang
        ? `<span class="lang-badge">🇫🇷 ${t('badge_french_only')}</span>`
        : '';

      document.getElementById('hero-dynamic').innerHTML = `
        <section class="grand-hero-section">
          <a href="${linkUne}" style="position:absolute; inset:0; z-index:2;"></a>
          <img src="${uneImg}" class="hero-bg-img" style="object-position: top center;" loading="lazy">
          <div class="hero-overlay">
            <span class="hero-tag">${t('badge_une')} • ${une.category}</span>
            ${langBadge}

            <h1 class="hero-title-main">${une.title} ${une.is_premium ? '<img src="GOLD.png" alt="★" style="height:0.75em;vertical-align:middle;margin-left:4px;" loading="lazy">' : ''}</h1>
            <p class="hero-excerpt">${une.excerpt || ''}</p>
          </div>
        </section>
      `;
      attachImageErrorHandlers(document.getElementById('hero-dynamic'));

      // 2. RENDER THEME FILTERS & ARTICLES FEED
      renderThemeFilterBar(articles, lang);
      renderArticlesFeed(articles, 'all', lang);

    } else {
      console.warn(`⚠️ Aucun article trouvé`);
      document.getElementById('magazine-feed').innerHTML = `<p style="text-align:center; padding:2rem; color:#888;">${t('msg_no_data')}</p>`;
    }
  } catch (e) {
    console.error('❌ Erreur chargement articles:', e);
  }
}

/**
 * 🏷️ Génère dynamiquement la barre de filtres par thème
 */
function renderThemeFilterBar(allArticles, lang) {
  const container = document.getElementById('theme-filter-bar');
  if (!container) return;

  // Extraire les catégories uniques présentes dans les articles
  const categories = Array.from(new Set(allArticles.map(a => a.category).filter(Boolean)));

  let html = `<button class="theme-pill active" data-cat="all">Tous</button>`;
  categories.forEach(cat => {
    html += `<button class="theme-pill" data-cat="${cat}">${cat}</button>`;
  });

  container.innerHTML = html;

  container.querySelectorAll('.theme-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.theme-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat;
      renderArticlesFeed(allArticles, cat, lang);
    });
  });
}

/**
 * 📰 Affiche les articles filtrés dans le flux magazine et la grille à découvrir
 */
function renderArticlesFeed(allArticles, activeCategory, lang) {
  const filtered = activeCategory === 'all'
    ? allArticles
    : allArticles.filter(a => (a.category || '').toLowerCase() === activeCategory.toLowerCase());

  // 1. Flux Magazine (8 articles max)
  const mainList = activeCategory === 'all' ? filtered.slice(1, 9) : filtered.slice(0, 8);
  const magFeed = document.getElementById('magazine-feed');

  if (magFeed) {
    if (mainList.length === 0) {
      magFeed.innerHTML = `<p style="text-align:center; padding:2rem; color:#888;">Aucun article dans le thème "${activeCategory}".</p>`;
    } else {
      magFeed.innerHTML = mainList.map(art => {
        const linkArt = `article.html?id=${art.id}`;
        const langBadge = art.language !== lang
          ? `<span class="lang-badge-small">🇫🇷</span>`
          : '';

        return `
        <article class="article-row">
          <div style="overflow:hidden; border-radius:4px; height:220px;">
            <a href="${linkArt}">
              <img src="${art.image_url}" class="art-img" loading="lazy">
            </a>
          </div>
          <div class="art-info">
            <span class="art-cat">${art.category}</span>
            ${langBadge}
            <a href="${linkArt}" style="text-decoration:none;">
              <h3 class="art-title">${art.title} ${art.is_premium ? '<img src="GOLD.png" alt="★" style="height:0.75em;vertical-align:middle;margin-left:4px;" loading="lazy">' : ''}</h3>
            </a>
            <p class="art-desc">${art.excerpt || art.slug}</p>
            <div style="font-size:0.8rem; color:#999; margin-top:8px;">${SolitiquoAPI.formatDate(art.published_at)}</div>
          </div>
        </article>
      `}).join('');
      attachImageErrorHandlers(magFeed);
    }
  }

  // 2. Grille À Découvrir
  const discoList = activeCategory === 'all' ? filtered.slice(9) : filtered.slice(8);
  const discoverGrid = document.getElementById('discover-grid');
  const discoverSection = document.querySelector('.discover-section');

  if (discoverGrid) {
    if (discoList.length > 0) {
      if (discoverSection) discoverSection.style.display = 'block';
      discoverGrid.innerHTML = discoList.map((art, idx) => {
        let cardClass = 'disco-card';
        const patternIndex = idx % 10;
        if (patternIndex === 4) {
          cardClass += ' disco-card-wide';
        } else if (patternIndex === 9) {
          cardClass += ' disco-card-full';
        }

        const excerptHtml = (patternIndex === 4 || patternIndex === 9) && (art.excerpt || art.slug)
          ? `<p class="disco-excerpt">${art.excerpt || ''}</p>`
          : '';

        const linkDisco = `article.html?id=${art.id}`;
        return `
        <a href="${linkDisco}" class="${cardClass}">
          <div class="disco-img-wrap">
            <img src="${art.image_url}" class="disco-img" loading="lazy">
          </div>
          <div class="disco-body">
            <span class="art-cat" style="font-size:0.65rem; margin-bottom:4px;">${art.category}</span>
            <h4 class="disco-title">${art.title} ${art.is_premium ? '<img src="GOLD.png" alt="★" style="height:0.75em;vertical-align:middle;margin-left:4px;" loading="lazy">' : ''}</h4>
            ${excerptHtml}
            <div class="disco-date">${SolitiquoAPI.formatDate(art.published_at)}</div>
          </div>
        </a>
      `}).join('');

      attachImageErrorHandlers(discoverGrid);
    } else {
      if (discoverSection) discoverSection.style.display = 'none';
      discoverGrid.innerHTML = '';
    }
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
        } else {
          // Autres pages : mise à jour instantanée sans rechargement
          console.log(`🌍 Interface mise à jour en ${selectedLang.toUpperCase()}`);
          document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: selectedLang } }));
        }
      });
    });

    console.log(`✅ Language switcher initialized (${currentLang})`);

  } catch (error) {
    console.error('❌ Erreur lors de l\'initialisation du language switcher:', error);
  }
}
