/**
 * Solitiquo — Système universel de placeholders et de résilience des images
 *
 * Résout définitivement :
 * - Les images absentes, cassées ou bloquées (404, CORS, réseau, bloqueur de pub)
 * - La dépendance aux services externes tiers (placehold.co, via.placeholder.com)
 * - Les boucles infinies onerror
 * - Les icônes natives de navigateur brisées
 * - Les conteneurs vides (Hero, cartes, grille, article détail, podcasts, vidéos, partis)
 *
 * Fonctionne 100% hors-ligne, sans requête réseau supplémentaire (Data-URI SVG vectoriel).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SolitiquoPlaceholders = factory();
    if (typeof root.handleImageError !== 'function') {
      root.handleImageError = root.SolitiquoPlaceholders.handleError;
    }
    // Compatibilité descendante avec l'ancien nom utilisé dans les templates existants
    root.handleImgError = function (img, type) {
      root.SolitiquoPlaceholders.handleError(img, type);
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // Palette de la charte officielle Solitiquo
  const COLORS = {
    bgDark: '#1E2621',
    bgMid: '#2B3730',
    bgDeep: '#171E1A',
    gold: '#C5C5A9',
    goldBright: '#D4AF37',
    red: '#C82823',
    white: '#FFFFFF',
    textMuted: 'rgba(197, 197, 169, 0.75)'
  };

  /**
   * Construit une Data-URI SVG vectorielle autonome avec la charte Solitiquo
   */
  function buildSvg(width, height, title, subtitle, iconType) {
    const w = parseInt(width, 10) || 800;
    const h = parseInt(height, 10) || 500;
    const minDim = Math.min(w, h);
    const circleRadius = Math.round(minDim * 0.22);
    const fontSizeTitle = Math.max(16, Math.round(minDim * 0.10));
    const fontSizeSub = Math.max(10, Math.round(minDim * 0.04));
    const centerY = Math.round(h / 2);
    const centerX = Math.round(w / 2);

    let iconPath = '';
    if (iconType === 'podcast') {
      // Icône Micro stylisée
      iconPath = `
        <rect x="${centerX - 8}" y="${centerY - 32}" width="16" height="26" rx="8" fill="${COLORS.gold}" opacity="0.85"/>
        <path d="M${centerX - 16} ${centerY - 18} A 16 16 0 0 0 ${centerX + 16} ${centerY - 18}" fill="none" stroke="${COLORS.gold}" stroke-width="2.5" stroke-linecap="round"/>
        <line x1="${centerX}" y1="${centerY - 2}" x2="${centerX}" y2="${centerY + 10}" stroke="${COLORS.gold}" stroke-width="2.5"/>
        <line x1="${centerX - 10}" y1="${centerY + 10}" x2="${centerX + 10}" y2="${centerY + 10}" stroke="${COLORS.gold}" stroke-width="2.5" stroke-linecap="round"/>
      `;
    } else if (iconType === 'video') {
      // Icône Play triangle stylisée
      iconPath = `
        <circle cx="${centerX}" cy="${centerY - 12}" r="22" fill="rgba(200, 40, 35, 0.25)" stroke="${COLORS.red}" stroke-width="2"/>
        <polygon points="${centerX - 6},${centerY - 22} ${centerX + 10},${centerY - 12} ${centerX - 6},${centerY - 2}" fill="${COLORS.white}"/>
      `;
    } else if (iconType === 'leader') {
      // Silhouette de portrait sobre
      iconPath = `
        <circle cx="${centerX}" cy="${centerY - 20}" r="16" fill="${COLORS.gold}" opacity="0.75"/>
        <path d="M${centerX - 24} ${centerY + 18} C${centerX - 24} ${centerY - 2}, ${centerX + 24} ${centerY - 2}, ${centerX + 24} ${centerY + 18}" fill="${COLORS.gold}" opacity="0.55"/>
      `;
    } else {
      // Monogramme "S" officiel Solitiquo en or
      iconPath = `
        <text x="${centerX}" y="${centerY - 8}" fill="${COLORS.gold}" font-family="'Playfair Display', Georgia, serif" font-size="${Math.round(minDim * 0.22)}" font-weight="900" text-anchor="middle" dominant-baseline="middle">S</text>
      `;
    }

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="sq-grad-${w}-${h}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${COLORS.bgDark}"/>
      <stop offset="50%" stop-color="${COLORS.bgMid}"/>
      <stop offset="100%" stop-color="${COLORS.bgDeep}"/>
    </linearGradient>
    <radialGradient id="sq-glow-${w}-${h}" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="rgba(197, 197, 169, 0.08)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
    <pattern id="sq-pat-${w}-${h}" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 32 M 0 0 L 32 32" fill="none" stroke="rgba(197, 197, 169, 0.025)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#sq-grad-${w}-${h})"/>
  <rect width="100%" height="100%" fill="url(#sq-glow-${w}-${h})"/>
  <rect width="100%" height="100%" fill="url(#sq-pat-${w}-${h})"/>
  <circle cx="${centerX}" cy="${centerY - (subtitle ? 12 : 0)}" r="${circleRadius}" fill="none" stroke="rgba(197, 197, 169, 0.12)" stroke-width="1.5"/>
  ${iconPath}
  <text x="${centerX}" y="${centerY + Math.round(minDim * 0.17)}" fill="${COLORS.gold}" font-family="'Playfair Display', Georgia, serif" font-size="${fontSizeTitle}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" letter-spacing="2">${title}</text>
  ${subtitle ? `<text x="${centerX}" y="${centerY + Math.round(minDim * 0.28)}" fill="${COLORS.textMuted}" font-family="'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="${fontSizeSub}" font-weight="600" text-anchor="middle" dominant-baseline="middle" letter-spacing="1.5" text-transform="uppercase">${subtitle}</text>` : ''}
</svg>`.trim();

    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  // Cache mémoire des Data-URIs précalculées pour performances maximales
  const cache = {
    hero: buildSvg(1600, 900, 'SOLITIQUO', 'Le média d\'analyse & d\'information', 'monogram'),
    article: buildSvg(800, 500, 'SOLITIQUO', 'Actualité & Analyse', 'monogram'),
    card: buildSvg(600, 400, 'SOLITIQUO', 'Éditorial', 'monogram'),
    square: buildSvg(400, 400, 'SOLITIQUO', 'Média', 'monogram'),
    podcast: buildSvg(400, 400, 'SOLITIQUO', 'Podcast', 'podcast'),
    video: buildSvg(800, 450, 'SOLITIQUO', 'Émission & Débat', 'video'),
    leader: buildSvg(400, 500, 'SOLITIQUO', 'Personnalité', 'leader'),
    logo: buildSvg(200, 200, 'S', '', 'monogram')
  };

  /**
   * Obtient un placeholder fiable pour un type et des dimensions donnés
   */
  function getPlaceholder(type, width, height) {
    const key = (type || 'article').toLowerCase();
    if (!width && !height && cache[key]) {
      return cache[key];
    }
    const w = parseInt(width, 10);
    const h = parseInt(height, 10);
    if (w && h && (!cache[key] || w !== 800 || h !== 500)) {
      return buildSvg(w, h, 'SOLITIQUO', key.toUpperCase());
    }
    return cache[key] || cache.article;
  }

  /**
   * Détecte intelligemment le rôle d'un élément <img> pour lui assigner le bon ratio
   */
  function detectImageType(img) {
    if (!img) return 'article';
    const cls = (img.className || '').toLowerCase();
    const id = (img.id || '').toLowerCase();
    const parentCls = (img.parentElement ? img.parentElement.className || '' : '').toLowerCase();

    if (cls.includes('hero-bg') || id.includes('hero') || parentCls.includes('grand-hero') || parentCls.includes('hero-dynamic')) {
      return 'hero';
    }
    if (cls.includes('pod') || id.includes('pod') || parentCls.includes('pod')) {
      return 'podcast';
    }
    if (cls.includes('replay') || cls.includes('video') || id.includes('video') || parentCls.includes('replay')) {
      return 'video';
    }
    if (cls.includes('leader') || id.includes('leader') || cls.includes('avatar') || cls.includes('author-img')) {
      return 'leader';
    }
    if (cls.includes('logo') || id.includes('logo') || cls.includes('party-card-logo') || cls.includes('party-logo')) {
      return 'square';
    }
    if (cls.includes('disco-img') || cls.includes('grid-card-img') || parentCls.includes('disco-img-wrap')) {
      return 'card';
    }
    if (cls.includes('art-image') || id === 'art-image' || cls.includes('mag-img') || cls.includes('art-img')) {
      return 'article';
    }
    return 'article';
  }

  /**
   * Surveille le chargement d'une image pour éviter qu'un serveur externe suspendu (timeout) ne bloque l'affichage
   */
  function monitorImage(img, explicitType) {
    if (!img || img.dataset.sqMonitored === 'true') return;
    img.dataset.sqMonitored = 'true';

    if (img.complete) {
      if (img.naturalWidth === 0) handleError(img, explicitType);
      return;
    }

    // Délai maximal avant bascule gracieuse sur le placeholder local (accéléré pour les serveurs instables)
    const src = img.src || '';
    const delay = (src.includes('picsum.photos') || src.includes('placehold.co') || src.includes('via.placeholder.com')) ? 1000 : 2500;

    const timer = setTimeout(() => {
      if (!img.dataset.sqFallbackApplied && (!img.complete || img.naturalWidth === 0)) {
        handleError(img, explicitType);
      }
    }, delay);

    img.addEventListener('load', () => clearTimeout(timer), { once: true });
    img.addEventListener('error', () => clearTimeout(timer), { once: true });
  }

  /**
   * Gestionnaire d'erreur d'image universel et résistant aux boucles infinies
   */
  function handleError(img, explicitType) {
    if (!img) return;
    // Si le fallback a déjà été appliqué, NE PAS RÉESSAYER -> Évite toute boucle infinie
    if (img.dataset.sqFallbackApplied === 'true') {
      img.onerror = null;
      return;
    }

    img.dataset.sqFallbackApplied = 'true';
    img.onerror = null; // Supprime l'attribut inline

    const type = explicitType || detectImageType(img);
    const w = img.getAttribute('width') || img.naturalWidth || 0;
    const h = img.getAttribute('height') || img.naturalHeight || 0;
    const fallbackUrl = getPlaceholder(type, w, h);

    // Appliquer le fallback vectoriel
    img.src = fallbackUrl;
    img.classList.add('sq-img-fallback-applied');

    // Assurer que le conteneur parent reste visible
    if (img.parentElement && img.parentElement.tagName === 'FIGURE') {
      img.parentElement.style.display = 'block';
    }
  }

  /**
   * Initialise la capture globale des erreurs d'images sur toute la page
   */
  function initGlobalListener() {
    if (typeof window === 'undefined') return;

    // Utilisation de la phase de capture (true) car les événements 'error' sur <img> ne bouillonnent pas (no-bubble)
    window.addEventListener(
      'error',
      function (event) {
        const target = event.target;
        if (target && target.tagName === 'IMG') {
          handleError(target);
        }
      },
      true
    );

    // Scanner au chargement et surveiller les images
    const scanImages = () => {
      document.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src');
        if (!src || src === '' || src === 'null' || src === 'undefined' || src.includes('placehold.co') || src.includes('via.placeholder.com')) {
          handleError(img);
        } else {
          monitorImage(img);
        }
      });
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scanImages);
    } else {
      scanImages();
    }

    // Observer pour les images ajoutées dynamiquement dans le DOM
    if (typeof MutationObserver !== 'undefined' && document.body) {
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1) {
              if (node.tagName === 'IMG') {
                monitorImage(node);
              } else if (node.querySelectorAll) {
                node.querySelectorAll('img').forEach(monitorImage);
              }
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Lancement automatique du listener dans l'environnement navigateur
  if (typeof window !== 'undefined') {
    initGlobalListener();
  }

  return {
    get: getPlaceholder,
    handleError: handleError,
    buildSvg: buildSvg,
    cache: cache
  };
});
