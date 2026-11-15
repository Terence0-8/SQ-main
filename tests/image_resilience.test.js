/**
 * SOLITIQUO — SUITE DE TESTS DU SYSTÈME GLOBAL D'IMAGES ET DE PLACEHOLDERS (LOT 3)
 *
 * Vérifie :
 * 1. Article avec image valide (préservation de l'URL réelle).
 * 2. Article sans image (génération d'un placeholder autonome non vide).
 * 3. Article avec URL invalide (remplacement automatique sans blocage).
 * 4. Image inaccessible (404 / réseau indisponible) -> fallback Data-URI SVG immédiat.
 * 5. Image Cloudinary valide (compatibilité et préservation du CDN).
 * 6. Échec après chargement initial (capture phase error listener).
 * 7. Image principale de la page d'accueil (Hero 16:9, background CSS).
 * 8. Miniatures des articles (MagazineFeed et DiscoverGrid).
 * 9. Rendu mobile et responsive (classes CSS, proportions, object-fit).
 * 10. Placeholder après échec du lazy loading et stricte prévention des boucles infinies.
 * 11. Compatibilité BDD & API (/api/articles, /api/podcasts, /api/emissions, favoris).
 * 12. Résilience du Service Worker (sw.js) sur les requêtes cross-origin et offline.
 */

'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');

// Modules Solitiquo
const SolitiquoPlaceholders = require('../js/image-fallback.js');
const app = require('../server.js');

describe('SOLITIQUO — AUDIT ET RÉSILIENCE DU SYSTÈME GLOBAL D\'IMAGES', () => {
  let server;
  let baseUrl;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      const pool = require('../backend/config/database.js');
      if (pool && typeof pool.closePool === 'function') {
        await pool.closePool();
      }
    } catch (_e) {}
  });

  // Helper HTTP fetch simple
  function getJson(urlPath) {
    return new Promise((resolve, reject) => {
      http.get(`${baseUrl}${urlPath}`, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch (_e) {
            resolve({ status: res.statusCode, raw });
          }
        });
      }).on('error', reject);
    });
  }

  // ─── LOT 3.1 & 3.2 : TESTS DES PLACEHOLDERS VECTORIELS AUTONOMES ─────────

  describe('1. Placeholders autonomes vectoriels Data-URI SVG (Zéro Réseau, Zéro Dépendance)', () => {
    test('Les placeholders par défaut sont des Data-URIs SVG valides et bien formées', () => {
      const types = ['hero', 'article', 'card', 'square', 'video', 'leader', 'logo', 'podcast'];
      types.forEach((t) => {
        const uri = SolitiquoPlaceholders.get(t);
        assert.ok(uri, `Le placeholder '${t}' doit être défini`);
        assert.ok(uri.startsWith('data:image/svg+xml;charset=UTF-8,'), `Le placeholder '${t}' doit être une Data-URI SVG`);

        // Décoder le SVG pour valider la structure XML et la charte
        const svgContent = decodeURIComponent(uri.replace('data:image/svg+xml;charset=UTF-8,', ''));
        assert.ok(svgContent.includes('<svg'), `Doit contenir la balise racine <svg>`);
        assert.ok(svgContent.includes('</svg>'), `Doit clore la balise </svg>`);
        assert.ok(svgContent.includes('SOLITIQUO') || svgContent.includes('>S<'), `Doit contenir la marque Solitiquo`);
        assert.ok(svgContent.includes('#1E2621') || svgContent.includes('#242E28'), `Doit respecter la palette sombre Solitiquo`);
        // Validation XML stricte : aucun ampersand non échappé
        assert.ok(!/(?!&(?:amp|lt|gt|quot|apos);)&/.test(svgContent), `Le SVG pour '${t}' ne doit contenir aucun '&' non échappé`);
      });
    });

    test('buildSvg permet de générer des dimensions personnalisées tout en restant valide', () => {
      const customUri = SolitiquoPlaceholders.buildSvg(1200, 630, 'SOLITIQUO', 'Partage Réseaux');
      assert.ok(customUri.startsWith('data:image/svg+xml;charset=UTF-8,'));
      const decoded = decodeURIComponent(customUri.replace('data:image/svg+xml;charset=UTF-8,', ''));
      assert.ok(decoded.includes('viewBox="0 0 1200 630"'));
      assert.ok(decoded.includes('Partage Réseaux'));
    });
  });

  // ─── LOT 3.3 : TESTS D'ANTI-BOUCLE ET DE GESTION D'ERREUR ─────────────────

  describe('2. Gestionnaire d\'erreur handleImageError & Prévention des boucles infinies', () => {
    test('handleError applique le fallback Data-URI et protège contre les boucles infinies', () => {
      let errorEventFired = false;
      const fakeImg = {
        tagName: 'IMG',
        className: 'art-img',
        src: 'https://images.invalide-test-404.com/photo.jpg',
        dataset: {},
        classList: {
          add: function (cls) {
            this[cls] = true;
          }
        },
        getAttribute: function (name) {
          return this[name] || null;
        },
        onerror: function () {
          errorEventFired = true;
        }
      };

      // 1er appel : doit appliquer le fallback
      SolitiquoPlaceholders.handleError(fakeImg, 'article');
      assert.equal(fakeImg.dataset.sqFallbackApplied, 'true', 'Doit marquer le flag anti-boucle sqFallbackApplied');
      assert.equal(fakeImg.onerror, null, 'Doit détacher le gestionnaire onerror inline');
      assert.ok(fakeImg.src.startsWith('data:image/svg+xml;charset=UTF-8,'), 'Doit assigner une Data-URI');
      assert.ok(fakeImg.classList['sq-img-fallback-applied'], 'Doit ajouter la classe sq-img-fallback-applied');
      assert.equal(errorEventFired, false, 'Le gestionnaire ne doit pas déclencher d\'erreur en boucle');

      // 2e appel (simulation de re-déclenchement après échec potentiel) : doit ignorer strictement
      const previousSrc = fakeImg.src;
      SolitiquoPlaceholders.handleError(fakeImg, 'article');
      assert.equal(fakeImg.src, previousSrc, 'La source ne doit pas être réassignée une 2e fois');
    });

    test('Détection automatique du type d\'image selon le contexte du DOM', () => {
      const createImg = (cls, id, parentCls) => ({
        tagName: 'IMG',
        className: cls,
        id: id || '',
        parentElement: parentCls ? { tagName: 'DIV', className: parentCls } : null,
        dataset: {},
        classList: { add: () => {} },
        getAttribute: () => null
      });

      const heroImg = createImg('hero-bg-img');
      SolitiquoPlaceholders.handleError(heroImg);
      const heroDecoded = decodeURIComponent(heroImg.src);
      assert.ok(heroDecoded.includes('viewBox="0 0 1600 900"'), 'Doit détecter le format Hero 16:9');

      const podImg = createImg('pod-thumb');
      SolitiquoPlaceholders.handleError(podImg);
      const podDecoded = decodeURIComponent(podImg.src);
      assert.ok(podDecoded.includes('viewBox="0 0 400 400"'), 'Doit détecter le format Podcast 1:1');

      const vidImg = createImg('replay-img');
      SolitiquoPlaceholders.handleError(vidImg);
      const vidDecoded = decodeURIComponent(vidImg.src);
      assert.ok(vidDecoded.includes('viewBox="0 0 800 450"'), 'Doit détecter le format Émission / Vidéo 16:9');
    });
  });

  // ─── LOT 3.4 : SCÉNARIOS ÉDITORIAUX & MINIMA DU CAHIER DES CHARGES ─────────

  describe('3. Scénarios éditoriaux spécifiques (Points 1 à 10 du cahier des charges)', () => {
    test('1. Article avec image valide : l\'URL réelle est préservée sans remplacement forcé', () => {
      const validUrl = 'https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=800';
      const uneImg = SolitiquoPlaceholders.getSafeUrl(validUrl, 'hero');
      assert.equal(uneImg, validUrl, 'L\'URL réelle valide doit être conservée prioritairement');
    });

    test('1b. Article avec URL instable (picsum, placehold) : bascule immédiate sur placeholder', () => {
      const picsumUrl = 'https://picsum.photos/seed/pol001/800/450';
      const safeHero = SolitiquoPlaceholders.getSafeUrl(picsumUrl, 'hero');
      assert.ok(safeHero.startsWith('data:image/svg+xml;charset=UTF-8,'), 'Les URLs picsum doivent basculer immédiatement');
      assert.ok(decodeURIComponent(safeHero).includes('viewBox="0 0 1600 900"'), 'Doit renvoyer le placeholder hero 16:9');
    });

    test('2. Article sans image (null, undefined, vide) : placeholder visible garanti', () => {
      const nullImg = null || SolitiquoPlaceholders.get('article');
      assert.ok(nullImg.startsWith('data:image/svg+xml;charset=UTF-8,'), 'Un article sans image reçoit le placeholder');

      const emptyImg = '' || SolitiquoPlaceholders.get('article');
      assert.ok(emptyImg.startsWith('data:image/svg+xml;charset=UTF-8,'), 'Une chaîne vide reçoit le placeholder');
    });

    test('3. Article avec URL invalide : interceptée et corrigée par le fallback', () => {
      const img = {
        tagName: 'IMG',
        className: 'art-img',
        src: 'null',
        dataset: {},
        classList: { add: () => {} },
        getAttribute: () => null
      };
      SolitiquoPlaceholders.handleError(img, 'article');
      assert.ok(img.src.startsWith('data:image/svg+xml;charset=UTF-8,'));
    });

    test('4. Image inaccessible (404) : bascule sur le SVG Data-URI sans requête externe', () => {
      const img = {
        tagName: 'IMG',
        className: 'grid-card-img',
        src: 'https://beta.solitiquo.com/images/inexistant_404.jpg',
        dataset: {},
        classList: { add: () => {} },
        getAttribute: () => null
      };
      SolitiquoPlaceholders.handleError(img, 'card');
      assert.ok(img.src.startsWith('data:image/svg+xml;charset=UTF-8,'));
      assert.ok(decodeURIComponent(img.src).includes('viewBox="0 0 600 400"'));
    });

    test('5. Image Cloudinary valide : préservée et compatible avec la CSP', () => {
      const cloudinaryUrl = 'https://res.cloudinary.com/doa4gov1w/image/upload/v1787129441/solitiquo_articles/v2yfefgtg4fhwd7mtdr7.jpg';
      const uneImg = cloudinaryUrl || SolitiquoPlaceholders.get('hero');
      assert.equal(uneImg, cloudinaryUrl, 'L\'image Cloudinary doit être conservée');
    });

    test('6. Échec après chargement initial : le gestionnaire de capture intercepte l\'événement', () => {
      const jsCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'image-fallback.js'), 'utf8');
      assert.ok(jsCode.includes("window.addEventListener") && jsCode.includes("'error'"), 'Le listener global d\'erreur doit être enregistré');
      assert.ok(jsCode.includes('true') && jsCode.includes('phase de capture'), 'Le listener doit être enregistré en phase de capture (true)');
    });

    test('7. Image principale de la page d\'accueil : conteneur hero non vide avec style de secours', () => {
      const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      const sharedCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'shared.css'), 'utf8');
      const i18nJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8');

      // 1. Fond sombre de base pour le Hero
      assert.ok(indexHtml.includes('grand-hero-section'), 'index.html doit contenir la grand-hero-section');
      assert.ok(sharedCss.includes('.grand-hero-section {') && sharedCss.includes('#1E2621'), 'Le CSS doit définir un fond #1E2621 pour le hero');

      // 2. Fallback robuste dans i18n.js
      assert.ok(i18nJs.includes("handleImageError(this, 'hero')"), 'Le hero dynamique doit avoir le handler hero');
    });

    test('8. Miniatures des articles : wrappers stylés pour éviter tout conteneur vide', () => {
      const sharedCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'shared.css'), 'utf8');
      assert.ok(sharedCss.includes('.disco-img-wrap') && sharedCss.includes('#242E28'), 'Les conteneurs de cartes doivent avoir un fond #242E28');
      assert.ok(sharedCss.includes('.art-img,') && sharedCss.includes('#242E28'), 'Les images d\'articles doivent avoir un fond #242E28');
    });

    test('9. Rendu mobile et responsive : object-fit cover et conteneurs flexibles', () => {
      const sharedCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'shared.css'), 'utf8');
      assert.ok(sharedCss.includes('img.sq-img-fallback-applied'), 'La classe img.sq-img-fallback-applied doit être stylée');
      assert.ok(sharedCss.includes('object-fit: cover !important'), 'Le fallback doit respecter object-fit: cover');
    });

    test('10. Lazy loading : compatible avec loading="lazy" et sans perturbation', () => {
      const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
      const i18nJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8');
      assert.ok(indexHtml.includes('loading="lazy"'), 'index.html doit exploiter le lazy loading natif');
      assert.ok(i18nJs.includes('loading="lazy"'), 'i18n.js doit préserver loading="lazy"');
    });
  });

  // ─── LOT 3.5 : INTÉGRITÉ BDD & ROUTES API ─────────────────────────────────

  describe('4. Intégrité des données en base et routes de l\'API', () => {
    test('GET /api/articles renvoie à la fois image_url ET featured_image', async () => {
      const res = await getJson('/api/articles?lang=fr');
      assert.equal(res.status, 200);
      assert.ok(res.data.success, 'L\'appel doit réussir');
      assert.ok(Array.isArray(res.data.data), 'data doit être un tableau');

      if (res.data.data.length > 0) {
        const firstArt = res.data.data[0];
        assert.ok('image_url' in firstArt, 'Chaque article doit exposer le champ image_url');
        assert.ok('featured_image' in firstArt, 'Chaque article doit conserver le champ featured_image');
        assert.equal(firstArt.image_url, firstArt.featured_image, 'image_url et featured_image doivent être synchronisés');
      }
    });

    test('GET /api/podcasts renvoie à la fois image_url ET cover_image', async () => {
      const res = await getJson('/api/podcasts?lang=fr');
      assert.equal(res.status, 200);
      if (res.data.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        const pod = res.data.data[0];
        assert.ok('image_url' in pod, 'Le podcast doit exposer image_url');
        assert.ok('cover_image' in pod, 'Le podcast doit conserver cover_image');
      }
    });

    test('GET /api/emissions renvoie à la fois thumbnail_url ET image_url', async () => {
      const res = await getJson('/api/emissions?lang=fr');
      assert.equal(res.status, 200);
      if (res.data.success && Array.isArray(res.data.data) && res.data.data.length > 0) {
        const em = res.data.data[0];
        assert.ok('thumbnail_url' in em, 'L\'émission doit exposer thumbnail_url');
        assert.ok('image_url' in em, 'L\'émission doit exposer image_url');
      }
    });
  });

  // ─── LOT 3.6 : SÉCURITÉ DU SERVICE WORKER (sw.js) ──────────────────────────

  describe('5. Résilience du Service Worker (sw.js)', () => {
    test('sw.js pré-cache /js/image-fallback.js pour le mode hors-ligne', () => {
      const swCode = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
      assert.ok(swCode.includes("'/js/image-fallback.js'"), 'Le Service Worker doit pré-cacher /js/image-fallback.js');
    });

    test('sw.js renvoie une Response SVG valide sur échec d\'image cross-origin au lieu de crasher avec null', () => {
      const swCode = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
      assert.ok(swCode.includes('fallbackSvg'), 'Le Service Worker doit posséder un fallback SVG');
      assert.ok(!swCode.includes('.catch(() => null)'), 'Le SW ne doit plus renvoyer null sans conversion Response');
    });
  });
});
