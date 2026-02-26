/**
 * ═══════════════════════════════════════════════════════════
 * SCRIPT PAGE RECHERCHE - SOLITIQUO
 * Recherche Full-Text via /api/search — avec filtres, tri, pagination
 * ═══════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', () => {

  // ── Éléments DOM ────────────────────────────────────────
  const mainSearchForm  = document.getElementById('mainSearchForm');
  const mainSearchInput = document.getElementById('mainSearchInput');
  const popularSearches = document.querySelector('.popular-searches');
  const resultsSection  = document.querySelector('.results-section');
  const resultsList     = document.getElementById('resultsList');
  const resultsCount    = document.getElementById('resultsCount');
  const searchQueryEl   = document.getElementById('searchQuery');
  const filterBtns      = document.querySelectorAll('.filter-btn');
  const resetFiltersBtn = document.getElementById('resetFilters');
  const sortSelect      = document.getElementById('sortResults');
  const noResultsDiv    = document.getElementById('noResultsDiv');
  const loadingDiv      = document.getElementById('searchLoading');

  if (!mainSearchForm || !mainSearchInput) {
    console.error('❌ Éléments de recherche introuvables');
    return;
  }

  let currentFilter = 'all';
  let currentQuery  = '';
  let debounceTimer = null;

  // ── Soumission du formulaire ─────────────────────────────
  mainSearchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = mainSearchInput.value.trim();
    if (q.length >= 2) triggerSearch(q);
  });

  // ── Recherche à la frappe (debounce 400ms) ───────────────
  mainSearchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = mainSearchInput.value.trim();
    if (q.length >= 2) {
      debounceTimer = setTimeout(() => triggerSearch(q), 400);
    } else {
      showDefault();
    }
  });

  // ── Recherches populaires ────────────────────────────────
  document.querySelectorAll('.popular-tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
      e.preventDefault();
      const q = tag.dataset.query;
      mainSearchInput.value = q;
      triggerSearch(q);
    });
  });

  // ── Filtres ───────────────────────────────────────────────
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      if (resetFiltersBtn) resetFiltersBtn.style.display = currentFilter !== 'all' ? 'flex' : 'none';
      if (currentQuery) triggerSearch(currentQuery);
    });
  });

  // ── Reset filtres ─────────────────────────────────────────
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      currentFilter = 'all';
      filterBtns.forEach(b => b.classList.remove('active'));
      const allBtn = document.querySelector('[data-filter="all"]');
      if (allBtn) allBtn.classList.add('active');
      resetFiltersBtn.style.display = 'none';
      if (currentQuery) triggerSearch(currentQuery);
    });
  }

  // ── Tri ───────────────────────────────────────────────────
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      if (currentQuery) triggerSearch(currentQuery);
    });
  }

  // ── Fonction principale : appel API ──────────────────────
  async function triggerSearch(query) {
    currentQuery = query;
    showLoading();

    try {
      const sort   = sortSelect ? sortSelect.value : 'relevance';
      const type   = currentFilter !== 'all' ? currentFilter : '';
      const params = new URLSearchParams({ q: query, sort });
      if (type) params.append('type', type);

      const res  = await fetch(`${window.API_URL}/search?${params.toString()}`);
      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'Erreur API');

      if (data.results && data.results.length > 0) {
        displayResults(data.results, query);
      } else {
        showNoResults();
      }
    } catch (err) {
      console.error('❌ Erreur recherche:', err);
      showNoResults();
    }
  }

  // ── Affichage des résultats ───────────────────────────────
  function displayResults(results, query) {
    hideAll();
    if (resultsSection) resultsSection.style.display = 'block';
    if (resultsCount)   resultsCount.textContent  = results.length;
    if (searchQueryEl)  searchQueryEl.textContent = query;

    resultsList.innerHTML = results.map(r => {
      const label    = getTypeLabel(r.type);
      const url      = getUrl(r);
      const dateStr  = r.date ? new Date(r.date).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' }) : '';
      const meta     = [r.category, r.duration ? r.duration + ' min' : ''].filter(Boolean).join(' · ');

      return `
        <article class="result-item">
          <span class="result-type result-type--${r.type}">${label}</span>
          <h3 class="result-title">
            <a href="${url}">${highlight(r.title, query)}</a>
          </h3>
          <p class="result-excerpt">${highlight(r.description || '', query)}</p>
          <div class="result-meta">
            ${dateStr ? `<span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              ${dateStr}</span>` : ''}
            ${meta ? `<span>· ${meta}</span>` : ''}
          </div>
        </article>`;
    }).join('');

    if (resultsSection) resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Helpers ───────────────────────────────────────────────
  function getTypeLabel(type) {
    return { article: 'Article', podcast: 'Podcast', emission: 'Émission' }[type] || type;
  }

  function getUrl(r) {
    if (r.type === 'article')  return `article.html?id=${r.id}`;
    if (r.type === 'podcast')  return `podcast.html?id=${r.id}`;
    if (r.type === 'emission') return `emissions.html?id=${r.id}`;
    return '#';
  }

  function highlight(text, query) {
    if (!query || !text) return text || '';
    const safe  = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safe})`, 'gi');
    return text.replace(regex, '<mark style="background:#ffeb3b;padding:0 2px;border-radius:3px;">$1</mark>');
  }

  // ── États d'affichage ─────────────────────────────────────
  function hideAll() {
    if (loadingDiv)      loadingDiv.style.display      = 'none';
    if (noResultsDiv)    noResultsDiv.style.display    = 'none';
    if (resultsSection)  resultsSection.style.display  = 'none';
    if (popularSearches) popularSearches.style.display = 'none';
  }

  function showLoading() {
    hideAll();
    if (loadingDiv) loadingDiv.style.display = 'block';
  }

  function showNoResults() {
    hideAll();
    if (noResultsDiv) noResultsDiv.style.display = 'block';
  }

  function showDefault() {
    hideAll();
    if (popularSearches) popularSearches.style.display = 'block';
  }

  // ── Récupérer query depuis URL au chargement ──────────────
  const urlQuery = new URLSearchParams(window.location.search).get('q');
  if (urlQuery) {
    mainSearchInput.value = urlQuery;
    triggerSearch(urlQuery);
  }
});
