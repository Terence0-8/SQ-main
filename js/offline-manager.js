/**
 * Solitiquo Offline Manager — Stockage In-App (Style Netflix)
 * Utilise IndexedDB pour enregistrer les articles, podcasts et émissions 
 * directement dans le navigateur pour une disponibilité 100% hors-ligne.
 */

const SolitiquoOffline = (function() {
  const DB_NAME = 'SolitiquoOfflineDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'offline_contents';

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        console.warn('⚠️ IndexedDB non supporté sur ce navigateur.');
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'storage_key' });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('downloaded_at', 'downloaded_at', { unique: false });
        }
      };

      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => {
        console.error('❌ Erreur ouverture IndexedDB:', e.target.error);
        resolve(null);
      };
    });
    return dbPromise;
  }

  function getStorageKey(id, type) {
    return `${type || 'article'}_${id}`;
  }

  return {
    /**
     * Enregistrer un contenu hors-ligne (Article, Podcast, Émission)
     */
    async saveContent(item) {
      if (!item || !item.id) return false;
      const db = await openDB();
      if (!db) return false;

      const type = item.type || 'article';
      const storage_key = getStorageKey(item.id, type);

      const record = {
        storage_key,
        id: item.id,
        type: type, // 'article', 'podcast', 'emission'
        title: item.title || 'Contenu Solitiquo',
        category: item.category || 'Décryptage',
        image_url: item.image_url || '',
        content: item.content || item.summary || '',
        excerpt: item.excerpt || '',
        read_time: item.read_time || 3,
        audio_url: item.audio_url || '',
        video_url: item.video_url || '',
        duration: item.duration || '',
        author: item.author || 'Équipe Solitiquo',
        published_at: item.published_at || new Date().toISOString(),
        downloaded_at: new Date().toISOString()
      };

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);

        req.onsuccess = () => {
          // Pré-cacher les ressources médias (images, audio) dans le cache SW si possible
          if ('caches' in window && record.image_url) {
            caches.open('solitiquo-offline-media').then(cache => {
              cache.add(record.image_url).catch(() => {});
              if (record.audio_url) cache.add(record.audio_url).catch(() => {});
            });
          }
          resolve(true);
        };
        req.onerror = () => resolve(false);
      });
    },

    /**
     * Supprimer un contenu hors-ligne
     */
    async removeContent(id, type = 'article') {
      const db = await openDB();
      if (!db) return false;

      const storage_key = getStorageKey(id, type);
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(storage_key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    },

    /**
     * Vérifier si un contenu est disponible hors-ligne
     */
    async isDownloaded(id, type = 'article') {
      const db = await openDB();
      if (!db) return false;

      const storage_key = getStorageKey(id, type);
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(storage_key);
        req.onsuccess = () => resolve(Boolean(req.result));
        req.onerror = () => resolve(false);
      });
    },

    /**
     * Récupérer tous les contenus enregistrés
     */
    async getAllDownloads() {
      const db = await openDB();
      if (!db) return [];

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          // Trier du plus récent téléchargement au plus ancien
          list.sort((a, b) => new Date(b.downloaded_at) - new Date(a.downloaded_at));
          resolve(list);
        };
        req.onerror = () => resolve([]);
      });
    },

    /**
     * Récupérer un contenu spécifique
     */
    async getContent(id, type = 'article') {
      const db = await openDB();
      if (!db) return null;

      const storage_key = getStorageKey(id, type);
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(storage_key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    },

    /**
     * Supprimer tous les contenus hors-ligne
     */
    async clearAll() {
      const db = await openDB();
      if (!db) return false;

      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      });
    },

    /**
     * Estimer l'espace occupé (en Mo)
     */
    async getStorageEstimate() {
      const downloads = await this.getAllDownloads();
      let totalBytes = 0;
      downloads.forEach(d => {
        totalBytes += JSON.stringify(d).length;
      });
      const mb = (totalBytes / (1024 * 1024)).toFixed(2);
      return { count: downloads.length, sizeMB: mb };
    }
  };
})();

if (typeof window !== 'undefined') {
  window.SolitiquoOffline = SolitiquoOffline;
}
