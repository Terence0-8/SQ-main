// ============================================================
// SERVICE DE TRADUCTION DEEPL
// Wrapper API DeepL pour traduction automatique FR <-> EN
// ============================================================

const axios = require('axios');

// Configuration DeepL
const DEEPL_API_KEY = process.env.DEEPL_API_KEY;
const DEEPL_API_URL = process.env.DEEPL_API_URL || 'https://api-free.deepl.com/v2'; // Free tier
const MAX_CHARS_PER_MONTH = 500000; // Quota gratuit DeepL

class TranslationService {
  constructor() {
    this.usedChars = 0; // Compteur local (devrait être en BDD pour production)
    this.lastResetDate = new Date();
  }

  /**
   * Vérifie si la clé API DeepL est configurée
   * @returns {boolean}
   */
  isConfigured() {
    return !!DEEPL_API_KEY;
  }

  /**
   * Vérifie le quota restant
   * @returns {Object} { available: boolean, used: number, remaining: number }
   */
  async checkQuota() {
    if (!this.isConfigured()) {
      return { available: false, error: 'API Key DeepL non configurée' };
    }

    try {
      const response = await axios.get(`${DEEPL_API_URL}/usage`, {
        headers: { 'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}` }
      });

      const { character_count, character_limit } = response.data;
      return {
        available: character_count < character_limit,
        used: character_count,
        limit: character_limit,
        remaining: character_limit - character_count
      };
    } catch (error) {
      console.error('❌ Erreur vérification quota DeepL:', error.message);
      return { available: false, error: error.message };
    }
  }

  /**
   * Traduit un texte simple
   * @param {string} text - Texte à traduire
   * @param {string} targetLang - Langue cible ('FR' ou 'EN')
   * @param {string} sourceLang - Langue source (optionnel, auto-détection)
   * @returns {Promise<string>} Texte traduit
   */
  async translateText(text, targetLang, sourceLang = null) {
    if (!this.isConfigured()) {
      throw new Error('API Key DeepL non configurée');
    }

    if (!text || text.trim() === '') {
      return '';
    }

    try {
      const params = {
        text: [text],
        target_lang: targetLang.toUpperCase(),
        preserve_formatting: true,
        formality: 'default' // 'more' pour formel, 'less' pour informel
      };

      if (sourceLang) {
        params.source_lang = sourceLang.toUpperCase();
      }

      const response = await axios.post(
        `${DEEPL_API_URL}/translate`,
        params,
        {
          headers: {
            'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const translated = response.data.translations[0].text;
      console.log(`✅ Traduction réussie: ${text.substring(0, 50)}... -> ${translated.substring(0, 50)}...`);
      return translated;

    } catch (error) {
      console.error('❌ Erreur traduction DeepL:', error.response?.data || error.message);
      throw new Error(`Erreur traduction: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Traduit du HTML en préservant les balises
   * @param {string} html - Contenu HTML à traduire
   * @param {string} targetLang - Langue cible ('FR' ou 'EN')
   * @param {string} sourceLang - Langue source (optionnel)
   * @returns {Promise<string>} HTML traduit
   */
  async translateHTML(html, targetLang, sourceLang = null) {
    if (!this.isConfigured()) {
      throw new Error('API Key DeepL non configurée');
    }

    if (!html || html.trim() === '') {
      return '';
    }

    try {
      const params = {
        text: [html],
        target_lang: targetLang.toUpperCase(),
        tag_handling: 'html', // Préserve les balises HTML
        preserve_formatting: true
      };

      if (sourceLang) {
        params.source_lang = sourceLang.toUpperCase();
      }

      const response = await axios.post(
        `${DEEPL_API_URL}/translate`,
        params,
        {
          headers: {
            'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.translations[0].text;

    } catch (error) {
      console.error('❌ Erreur traduction HTML DeepL:', error.response?.data || error.message);
      throw new Error(`Erreur traduction HTML: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Traduit un article complet (title + excerpt + content)
   * @param {Object} article - Objet article avec { title, excerpt, content }
   * @param {string} targetLang - Langue cible ('fr' ou 'en')
   * @returns {Promise<Object>} Article traduit
   */
  async translateArticle(article, targetLang) {
    if (!this.isConfigured()) {
      throw new Error('API Key DeepL non configurée. Ajoutez DEEPL_API_KEY dans .env');
    }

    // Vérifier le quota avant de traduire
    const quota = await this.checkQuota();
    if (!quota.available) {
      throw new Error(`Quota DeepL atteint (${quota.used}/${quota.limit} caractères utilisés)`);
    }

    const sourceLang = article.language || 'fr';
    const deepLTarget = targetLang.toUpperCase() === 'EN' ? 'EN-US' : 'FR'; // DeepL utilise EN-US pour anglais américain

    console.log(`🌍 Traduction article "${article.title}" de ${sourceLang} vers ${targetLang}...`);

    try {
      // Traduire en parallèle pour gagner du temps
      const [translatedTitle, translatedExcerpt, translatedContent] = await Promise.all([
        this.translateText(article.title, deepLTarget, sourceLang.toUpperCase()),
        article.excerpt ? this.translateText(article.excerpt, deepLTarget, sourceLang.toUpperCase()) : Promise.resolve(''),
        this.translateHTML(article.content, deepLTarget, sourceLang.toUpperCase())
      ]);

      console.log(`✅ Article traduit avec succès`);

      return {
        title: translatedTitle,
        excerpt: translatedExcerpt,
        content: translatedContent,
        language: targetLang,
        translation_method: 'ai'
      };

    } catch (error) {
      console.error(`❌ Erreur traduction article:`, error.message);
      throw error;
    }
  }

  /**
   * Détecte automatiquement la langue d'un texte
   * @param {string} text - Texte à analyser
   * @returns {Promise<string>} Code langue ('FR', 'EN', etc.)
   */
  async detectLanguage(text) {
    // DeepL Free tier ne supporte pas la détection de langue
    // On utilise une heuristique simple
    const frenchWords = ['le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'est', 'sont'];
    const englishWords = ['the', 'a', 'an', 'and', 'or', 'is', 'are', 'of', 'to', 'in'];

    const lowerText = text.toLowerCase();
    const frenchCount = frenchWords.filter(w => lowerText.includes(` ${w} `)).length;
    const englishCount = englishWords.filter(w => lowerText.includes(` ${w} `)).length;

    return frenchCount > englishCount ? 'FR' : 'EN';
  }
}

// Export singleton
module.exports = new TranslationService();
