// ============================================================
// Solitiquo — Service Worker
// Stratégie : Stale-While-Revalidate pour assets,
//             Network-First pour HTML,
//             Network-Only pour API
// ============================================================

// CACHE_NAME inclut la version/date du déploiement
const CACHE_NAME = 'solitiquo-v20260914-offline-custom-v3';

// Assets à pré-cacher au moment de l'installation (TOUTES les pages et TOUS les fichiers CSS)
const PRECACHE_URLS = [
    // Pages HTML
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
    '/data.html',
    '/recherche.html',
    '/auth.html',
    '/abonnement.html',
    '/paiement.html',
    '/dossier.html',
    '/cookies.html',
    '/contact.html',
    '/conditions-utilisation.html',
    '/mentions-legales.html',
    '/politique-confidentialite.html',
    '/offline.html',

    // TOUS les styles CSS (avec et sans versioning ?v=38) pour un affichage 100% parfait hors-connexion
    '/css/shared.css',
    '/css/shared.css?v=38',
    '/css/cameroon-map.css',
    '/css/pages/abonnement.css',
    '/css/pages/abonnement.css?v=38',
    '/css/pages/admin.css',
    '/css/pages/article.css',
    '/css/pages/article.css?v=38',
    '/css/pages/auth.css',
    '/css/pages/auth.css?v=38',
    '/css/pages/conditions-utilisation.css',
    '/css/pages/contact.css',
    '/css/pages/cookies.css',
    '/css/pages/dossier.css',
    '/css/pages/editeur-article.css',
    '/css/pages/editeur-emission.css',
    '/css/pages/editeur-parti.css',
    '/css/pages/editeur-podcast.css',
    '/css/pages/emissions.css',
    '/css/pages/emissions.css?v=38',
    '/css/pages/index.css',
    '/css/pages/index.css?v=38',
    '/css/pages/mentions-legales.css',
    '/css/pages/page-404.css',
    '/css/pages/paiement.css',
    '/css/pages/partis-politiques.css',
    '/css/pages/partis-politiques.css?v=38',
    '/css/pages/podcast.css',
    '/css/pages/podcast.css?v=38',
    '/css/pages/podcasts.css',
    '/css/pages/podcasts.css?v=38',
    '/css/pages/politique-confidentialite.css',
    '/css/pages/politique.css',
    '/css/pages/politique.css?v=38',
    '/css/pages/profil.css',
    '/css/pages/profil.css?v=38',
    '/css/pages/recherche.css',
    '/css/pages/social.css',
    '/css/pages/social.css?v=38',

    // Scripts JS essentiels
    '/js/solitiquo.js',
    '/js/api.js',
    '/js/config.js',
    '/js/i18n.js',
    '/js/lazyload.js',
    '/js/offline-manager.js',

    // Assets généraux
    '/logo.svg',
    '/logo.png',
    '/manifest.json'
];

// ── INSTALL : pré-cache résilient des assets critiques ──
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async (cache) => {
                await Promise.all(
                    PRECACHE_URLS.map((url) =>
                        cache.add(url).catch((err) => console.warn(`[SW] Échec pré-cache pour ${url}:`, err))
                    )
                );
            })
            .then(() => self.skipWaiting())
    );
});

// ── ACTIVATE : migration douce et conservation des styles ──
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const currentCache = await caches.open(CACHE_NAME);
            const allKeys = await caches.keys();
            for (const key of allKeys) {
                if (key.startsWith('solitiquo-') && key !== CACHE_NAME && key !== 'solitiquo-offline-media') {
                    // Transférer les assets vitaux (CSS/JS/HTML) vers le nouveau cache avant suppression
                    try {
                        const oldCache = await caches.open(key);
                        const oldRequests = await oldCache.keys();
                        for (const req of oldRequests) {
                            const match = await currentCache.match(req);
                            if (!match) {
                                const oldRes = await oldCache.match(req);
                                if (oldRes) await currentCache.put(req, oldRes.clone());
                            }
                        }
                    } catch (_e) {}
                    await caches.delete(key);
                } else if (!key.startsWith('solitiquo-')) {
                    await caches.delete(key);
                }
            }
            await self.clients.claim();
        })()
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
                    const path = url.pathname;

                    // 1. Profil : Toujours servir profil.html (accès aux téléchargements)
                    if (path.includes('profil.html')) {
                        const profilCached = (await caches.match(request)) || 
                                             (await caches.match('/profil.html', { ignoreSearch: true })) || 
                                             (await caches.match('/profil.html'));
                        if (profilCached) return profilCached;
                    }

                    // 2. Lecteur hors-ligne d'un article ou podcast téléchargé (ex: article.html?id=123 ou ?slug=...)
                    if ((path.includes('article.html') || path.includes('podcast.html') || path.includes('emissions.html')) && (url.searchParams.has('id') || url.searchParams.has('slug'))) {
                        const readerCached = (await caches.match(request, { ignoreSearch: true })) || 
                                             (await caches.match(path)) || 
                                             (await caches.match(request));
                        if (readerCached) return readerCached;
                    }

                    // 3. RÈGLE CLIENT : Pour TOUTES les autres pages hors-connexion, servir offline.html !
                    const offlinePage = (await caches.match('/offline.html')) || 
                                        (await caches.match('/offline.html', { ignoreSearch: true }));
                    if (offlinePage) return offlinePage;

                    // 4. Ultime secours : HTML de secours valide
                    return new Response(
                        `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Solitiquo — Hors connexion</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:'Inter',system-ui,sans-serif;background:#FAFCF9;color:#37463D;text-align:center;padding:40px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;}h1{font-size:1.8rem;margin-bottom:12px;font-family:serif;}p{color:#64748B;margin-bottom:24px;max-width:480px;line-height:1.6;}a{display:inline-block;padding:12px 26px;background:#37463D;color:#fff;text-decoration:none;border-radius:30px;font-weight:700;box-shadow:0 4px 16px rgba(55,70,61,0.2);}</style></head><body><h1>Vous êtes hors-connexion</h1><p>Cette page nécessite une connexion réseau. Vos contenus téléchargés restent accessibles.</p><a href="/profil.html?tab=downloads">Consulter mes téléchargements →</a></body></html>`,
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

    // ── Assets locaux (CSS, JS, images, fonts) : Cache-First hors-connexion, Stale-While-Revalidate en ligne ──
    event.respondWith(
        (async () => {
            // 1. Chercher dans tous les caches avec la requête exacte, ignoreSearch, ou le pathname
            let cached = await caches.match(request, { ignoreSearch: true });
            if (!cached) {
                cached = await caches.match(url.pathname, { ignoreSearch: true });
            }
            if (!cached) {
                const cache = await caches.open(CACHE_NAME);
                cached = (await cache.match(request, { ignoreSearch: true })) || (await cache.match(url.pathname));
            }

            // 2. Si présent en cache, servir instantanément (vital pour la fluidité et le hors-connexion)
            if (cached) {
                // Mise à jour douce en arrière-plan sans bloquer
                fetch(request)
                    .then(async (response) => {
                        if (response && response.status === 200 && response.type !== 'opaque') {
                            const cache = await caches.open(CACHE_NAME);
                            await cache.put(request, response.clone());
                            if (url.search) await cache.put(url.pathname, response.clone());
                        }
                    })
                    .catch(() => {});
                return cached;
            }

            // 3. Si non présent en cache, tenter le réseau
            try {
                const networkResponse = await fetch(request);
                if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, networkResponse.clone());
                    if (url.search) await cache.put(url.pathname, networkResponse.clone());
                }
                return networkResponse;
            } catch (_err) {
                // 4. Secours hors-connexion : si c'est un fichier CSS, renvoyer shared.css ou du CSS neutre pour éviter l'erreur réseau
                if (url.pathname.endsWith('.css')) {
                    const fallbackCss = (await caches.match('/css/shared.css', { ignoreSearch: true })) ||
                                        (await caches.match('/css/shared.css'));
                    if (fallbackCss) return fallbackCss;
                    return new Response('/* Solitiquo offline fallback css */', {
                        headers: { 'Content-Type': 'text/css' }
                    });
                }
                return new Response('', { status: 503, statusText: 'Offline Asset Unavailable' });
            }
        })()
    );
});
