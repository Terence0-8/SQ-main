// ============================================================
// Solitiquo — Service Worker
// Stratégie : Stale-While-Revalidate pour assets,
//             Network-First pour HTML,
//             Network-Only pour API
// ============================================================

// CACHE_NAME inclut la version/date du déploiement
const CACHE_NAME = 'solitiquo-v20260914-fixed';

// Assets à pré-cacher au moment de l'installation
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/profil.html',
    '/article.html',
    '/podcast.html',
    '/podcasts.html',
    '/emissions.html',
    '/politique.html',
    '/social.html',
    '/partis-politiques.html',
    '/recherche.html',
    '/auth.html',
    '/offline.html',
    '/css/shared.css',
    '/css/pages/profil.css',
    '/css/pages/article.css',
    '/css/pages/podcast.css',
    '/css/pages/politique.css',
    '/css/pages/social.css',
    '/css/pages/recherche.css',
    '/js/solitiquo.js',
    '/js/api.js',
    '/js/config.js',
    '/js/i18n.js',
    '/js/lazyload.js',
    '/js/offline-manager.js',
    '/logo.svg',
    '/logo.png',
    '/manifest.json'
];

// ── INSTALL : pré-cache résilient des assets critiques ──
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async (cache) => {
                // Mise en cache individuelle pour éviter qu'un seul échec ne bloque toute l'installation
                await Promise.all(
                    PRECACHE_URLS.map((url) =>
                        cache.add(url).catch((err) => console.warn(`[SW] Échec pré-cache pour ${url}:`, err))
                    )
                );
            })
            .then(() => self.skipWaiting())
    );
});

// ── ACTIVATE : nettoyage des anciens caches ──
self.addEventListener('activate', (event) => {
    const PRESERVED_CACHES = [CACHE_NAME, 'solitiquo-offline-media'];
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => !PRESERVED_CACHES.includes(key))
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

    // ── API GET : Network-Only ──
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(() => {
                return new Response(
                    JSON.stringify({ success: false, error: 'NetworkUnavailable', offline: true }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        return;
    }

    // ── Pages HTML : Network-First avec fallback offline propre ──
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Mettre à jour le cache avec la nouvelle version si valide
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, clone);
                            if (url.pathname === '/profil.html') {
                                cache.put('/profil.html', response.clone());
                            }
                        });
                    }
                    return response;
                })
                .catch(async () => {
                    // 1. Tenter la correspondance exacte dans le cache
                    let cached = await caches.match(request);
                    if (cached) return cached;

                    // 2. Tenter sans query string (ex: article.html?id=51 -> article.html, profil.html?tab=downloads -> profil.html)
                    cached = await caches.match(request, { ignoreSearch: true });
                    if (cached) return cached;

                    // 3. Fallbacks ciblés selon l'URL demandée
                    const path = url.pathname;
                    if (path === '/' || path === '/index.html') {
                        const indexCached = (await caches.match('/index.html')) || (await caches.match('/'));
                        if (indexCached) return indexCached;
                    }
                    if (path.includes('profil.html')) {
                        const profilCached = await caches.match('/profil.html');
                        if (profilCached) return profilCached;
                    }
                    if (path.includes('article.html')) {
                        const articleCached = await caches.match('/article.html');
                        if (articleCached) return articleCached;
                    }
                    if (path.includes('podcast.html')) {
                        const podcastCached = await caches.match('/podcast.html');
                        if (podcastCached) return podcastCached;
                    }

                    // 4. Servir la page hors-ligne officielle de Solitiquo
                    const offlinePage = await caches.match('/offline.html');
                    if (offlinePage) return offlinePage;

                    // 5. Ultime secours : HTML de secours valide (évite le crash natif du navigateur)
                    return new Response(
                        `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Solitiquo — Hors connexion</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:'Inter',system-ui,sans-serif;background:#fbfcfb;color:#37463D;text-align:center;padding:40px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;}h1{font-size:1.8rem;margin-bottom:12px;font-family:serif;}p{color:#64748B;margin-bottom:24px;max-width:480px;line-height:1.6;}a{display:inline-block;padding:12px 26px;background:#37463D;color:#fff;text-decoration:none;border-radius:30px;font-weight:700;box-shadow:0 4px 16px rgba(55,70,61,0.2);}</style></head><body><h1>Vous êtes hors-connexion</h1><p>Cette page n'est pas encore enregistrée dans votre appareil. Vos contenus téléchargés restent accessibles.</p><a href="/profil.html?tab=downloads">Consulter mes téléchargements →</a></body></html>`,
                        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                    );
                })
        );
        return;
    }

    // ── Assets externes cross-origin (fonts Google, Cloudinary) : cache si dispo, sinon réseau ──
    if (url.hostname !== self.location.hostname) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
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
                    if (response && response.status === 200 && response.type !== 'opaque') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => cached);

            return cached || fetchPromise;
        })
    );
});
