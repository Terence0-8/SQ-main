/**
 * ═══════════════════════════════════════════════════════════
 * SCRIPT PAGE RECHERCHE - SOLITIQUO
 * Gestion recherche, filtres, pagination
 * ═══════════════════════════════════════════════════════════
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('🔍 Script recherche chargé');
  
  // Éléments DOM
  const mainSearchForm = document.getElementById('mainSearchForm');
  const mainSearchInput = document.getElementById('mainSearchInput');
  const popularSearches = document.querySelector('.popular-searches');
  const resultsSection = document.querySelector('.results-section');
  const noResults = document.querySelector('.no-results');
  const resultsList = document.getElementById('resultsList');
  const resultsCount = document.getElementById('resultsCount');
  const searchQuery = document.getElementById('searchQuery');
  const filterBtns = document.querySelectorAll('.filter-btn');
  const resetFiltersBtn = document.getElementById('resetFilters');
  const sortSelect = document.getElementById('sortResults');
  
  let currentFilter = 'all';
  let currentQuery = '';
  
  // Vérifier que les éléments existent
  if (!mainSearchForm || !mainSearchInput) {
    console.error('❌ Éléments de recherche introuvables');
    return;
  }
  
  // DONNÉES FACTICES (à remplacer par API dynamique)
  const mockResults = [
    {
      type: 'article',
      title: 'Paul Biya annonce une nomination historique',
      excerpt: 'Dans un geste politique inédit, le président Paul Biya a annoncé son intention de nommer Dieudonné Moukala au poste de premier ministre...',
      date: '5 novembre 2025',
      category: 'Politique',
      url: 'article.html'
    },
    {
      type: 'podcast',
      title: 'Les bastions oubliés de la République',
      excerpt: 'Un reportage sonore immersif sur les quartiers où le lien institutionnel se réinvente...',
      date: '2 novembre 2025',
      duration: '34 min',
      url: 'podcast-0.html'
    },
    {
      type: 'article',
      title: 'Réforme électorale : les enjeux pour 2025',
      excerpt: 'Les partis politiques s\'accordent sur la nécessité d\'une réforme en profondeur du système électoral camerounais...',
      date: '1 novembre 2025',
      category: 'Politique',
      url: 'article.html'
    },
    {
      type: 'emission',
      title: 'Débat : L\'avenir du multipartisme au Cameroun',
      excerpt: 'Une émission spéciale réunissant les principaux acteurs politiques pour débattre de l\'avenir démocratique...',
      date: '30 octobre 2025',
      duration: '58 min',
      url: 'emissions.html'
    }
  ];
  
  // Gestion formulaire recherche
  mainSearchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = mainSearchInput.value.trim();
    if (query) {
      performSearch(query);
    }
  });
  
  // Recherches populaires
  document.querySelectorAll('.popular-tag').forEach(tag => {
    tag.addEventListener('click', (e) => {
      e.preventDefault();
      const query = tag.dataset.query;
      mainSearchInput.value = query;
      performSearch(query);
    });
  });
  
  // Filtres
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      
      if (currentQuery) {
        performSearch(currentQuery);
      }
      
      if (resetFiltersBtn) {
        resetFiltersBtn.style.display = currentFilter !== 'all' ? 'flex' : 'none';
      }
    });
  });
  
  // Reset filtres
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      currentFilter = 'all';
      filterBtns.forEach(btn => btn.classList.remove('active'));
      const allBtn = document.querySelector('[data-filter="all"]');
      if (allBtn) allBtn.classList.add('active');
      resetFiltersBtn.style.display = 'none';
      
      if (currentQuery) {
        performSearch(currentQuery);
      }
    });
  }
  
  // Tri
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      if (currentQuery) {
        performSearch(currentQuery);
      }
    });
  }
  
  // Fonction principale recherche
  function performSearch(query) {
    console.log('🔎 Recherche pour:', query);
    currentQuery = query;
    
    // Masquer recherches populaires
    if (popularSearches) {
      popularSearches.style.display = 'none';
    }
    
    // Filtrer résultats selon le filtre actif
    let filteredResults = mockResults;
    if (currentFilter !== 'all') {
      filteredResults = mockResults.filter(r => r.type === currentFilter);
    }
    
    // Simuler recherche (dans la vraie vie, appel API)
    const results = filteredResults.filter(r => 
      r.title.toLowerCase().includes(query.toLowerCase()) ||
      r.excerpt.toLowerCase().includes(query.toLowerCase())
    );
    
    console.log('📊 Résultats trouvés:', results.length);
    
    // Afficher résultats
console.log('Résultats trouvés:', results.length);
if (results.length > 0) {
  displayResults(results, query);
} else {
  console.log('Aucun résultat, affichage message');
  showNoResults();
}

  }
  
  // Afficher résultats
  function displayResults(results, query) {
    if (!resultsSection || !resultsList || !resultsCount || !searchQuery) {
      console.error('❌ Éléments d\'affichage manquants');
      return;
    }
    
    resultsSection.style.display = 'block';
    if (noResults) noResults.style.display = 'none';
    
    resultsCount.textContent = results.length;
    searchQuery.textContent = query;
    
    resultsList.innerHTML = results.map(result => `
      <article class="result-item">
        <span class="result-type">${getTypeLabel(result.type)}</span>
        <h3 class="result-title">
          <a href="${result.url}">${highlightQuery(result.title, query)}</a>
        </h3>
        <p class="result-excerpt">${highlightQuery(result.excerpt, query)}</p>
        <div class="result-meta">
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            ${result.date}
          </span>
          ${result.category ? `<span>• ${result.category}</span>` : ''}
          ${result.duration ? `<span>• ${result.duration}</span>` : ''}
        </div>
      </article>
    `).join('');
    
    // Scroll vers résultats
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  
 function showNoResults() {
  console.log('📛 Affichage: Aucun résultat');
  
  // Masquer tout
  if (resultsSection) resultsSection.style.display = 'none';
  if (popularSearches) popularSearches.style.display = 'none';
  if (filterBtns.length > 0) document.querySelector('.search-filters').style.display = 'none';
  
  // Afficher "aucun résultat"
  const noResultsDiv = document.getElementById('noResultsDiv');
  if (noResultsDiv) {
    noResultsDiv.style.display = 'block';
    console.log('✅ Div aucun résultat affichée');
  } else {
    console.error('❌ Div aucun résultat NOT FOUND');
  }
}

  
  // Helpers
  function getTypeLabel(type) {
    const labels = {
      'article': 'Article',
      'podcast': 'Podcast',
      'emission': 'Émission'
    };
    return labels[type] || type;
  }
  
  function highlightQuery(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark style="background:#ffeb3b;padding:0 2px;border-radius:3px;">$1</mark>');
  }
  
  // Récupérer query depuis URL si présente
  const urlParams = new URLSearchParams(window.location.search);
  const urlQuery = urlParams.get('q');
  
  if (urlQuery) {
    console.log('🔗 Paramètre URL détecté:', urlQuery);
    mainSearchInput.value = urlQuery;
    performSearch(urlQuery);
  } else {
    console.log('ℹ️ Aucune recherche, affichage par défaut');
  }
});
