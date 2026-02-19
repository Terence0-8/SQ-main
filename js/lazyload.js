/**
 * lazyload.js — Intersection Observer fallback for lazy loading
 *
 * Images must have:
 *   loading="lazy"          ← native lazy loading (modern browsers)
 *   data-src="real-url"     ← only needed for the IO fallback path
 *
 * For modern browsers that support loading="lazy", this script does nothing
 * extra. For older browsers (iOS < 15.4, Android Chrome < 77, etc.) the
 * Intersection Observer swaps data-src → src when the image enters the
 * viewport.
 *
 * Usage:
 *   <img src="placeholder.webp" data-src="real-image.webp" loading="lazy" alt="…">
 *   OR (simpler — native only, no fallback needed):
 *   <img src="real-image.webp" loading="lazy" alt="…">
 */

(function () {
    'use strict';

    // If the browser natively supports loading="lazy", nothing extra to do.
    if ('loading' in HTMLImageElement.prototype) return;

    // If IntersectionObserver is not available either, just exit
    // (images will load normally without any optimisation).
    if (!('IntersectionObserver' in window)) return;

    var options = {
        rootMargin: '200px 0px', // start loading 200 px before entering viewport
        threshold: 0,
    };

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;

            var img = entry.target;
            var dataSrc = img.getAttribute('data-src');

            if (dataSrc) {
                img.src = dataSrc;
                img.removeAttribute('data-src');
            }

            var dataSrcset = img.getAttribute('data-srcset');
            if (dataSrcset) {
                img.srcset = dataSrcset;
                img.removeAttribute('data-srcset');
            }

            img.classList.add('lazy-loaded');
            observer.unobserve(img);
        });
    }, options);

    // Observe all images that have data-src (opt-in to IO fallback)
    function observeImages() {
        var imgs = document.querySelectorAll('img[data-src], img[data-srcset]');
        imgs.forEach(function (img) {
            observer.observe(img);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeImages);
    } else {
        observeImages();
    }
})();
