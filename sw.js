// ============================================================
// Solitiquo — Service Worker
// Stratégie : Stale-While-Revalidate pour assets,
//             Network-First pour HTML,
//             Network-Only pour API
// ============================================================

// CACHE_NAME inclut la date du déploiement (format YYYYMMDD)
// → à chaque nouveau déploiement, le nom change et l'ancien cache est purgé automatiquement
// → plus besoin de bumper manuellement un numéro de version
const CACHE_NAME = 'solitiquo-20260226';

// Assets à pré-cacher au moment de l'installation
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/offline.html',
    '/css/shared.css',
    '/js/solitiquo.js',
    '/js/api.js',
    '/js/config.js',
    '/js/i18n.js',
    '/js/lazyload.js',
    '/logo.svg',
    '/logo.png',
    '/manifest.json'
];

// ── INSTALL : pré-cache des assets critiques ──
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// ── ACTIVATE : nettoyage des anciens caches ──
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// ── FETCH : stratégie selon le type de requête ──
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorer les requêtes non-GET
    if (request.method !== 'GET') return;

    // ── API : Network-Only (données toujours fraîches) ──
    if (url.pathname.startsWith('/api/')) {
        return;
    }

    // ── Pages HTML : Network-First (fraîches si online, cache si offline) ──
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Mettre à jour le cache avec la nouvelle version
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() => {
                    // Offline → servir depuis le cache, sinon page hors ligne
                    return caches.match(request).then((cached) => {
                        return cached || caches.match('/offline.html');
                    });
                })
        );
        return;
    }

    // ── Assets externes cross-origin (fonts Google, Cloudinary) : cache si dispo, sinon réseau ──
    // Note : les réponses "opaque" (CORS sans credentials) sont exclues du cache
    // car leur status est toujours 0 et on ne peut pas vérifier leur validité
    if (url.hostname !== self.location.hostname) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
                    // Ne cacher que les réponses CORS valides (type !== 'opaque')
                    if (response && response.status === 200 && response.type === 'cors') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                }).catch(() => null);
            })
        );
        return;
    }

    // ── Assets locaux (CSS, JS, images) : Stale-While-Revalidate ──
    event.respondWith(
        caches.match(request).then((cached) => {
            const fetchPromise = fetch(request)
                .then((response) => {
                    // Ne cacher que les réponses valides
                    if (response && response.status === 200 && response.type !== 'opaque') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => cached);

            // Retourner le cache immédiatement, mettre à jour en arrière-plan
            return cached || fetchPromise;
        })
    );
});
