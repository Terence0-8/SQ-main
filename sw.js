// ============================================================
// Solitiquo — Service Worker v1
// Stratégie : Stale-While-Revalidate pour assets,
//             Network-First pour HTML,
//             Network-Only pour API
// ============================================================

const CACHE_NAME = 'solitiquo-v1';

// Assets à pré-cacher au moment de l'installation
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/css/shared.css',
    '/js/solitiquo.js',
    '/js/api.js',
    '/js/config.js',
    '/js/i18n.js',
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
                    // Offline → servir depuis le cache
                    return caches.match(request).then((cached) => {
                        return cached || caches.match('/index.html');
                    });
                })
        );
        return;
    }

    // ── Assets (CSS, JS, images, polices) : Stale-While-Revalidate ──
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
