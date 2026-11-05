/* global document, fetch, URLSearchParams */
/**
 * Solitiquo DATA — Explorateur Statistique Public (Lot 3D)
 * Moteur de recherche statistique, filtres territoriaux et sectoriels,
 * fiches d'indicateurs détaillées et exportations multi-formats (CSV, JSON, JSON-LD).
 */

'use strict';

(function () {
  const escapeHtml = (val) => String(val || '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

  const formatNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return Number(num).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  };

  let currentFilters = {
    q: '',
    category: '',
    territory: '',
    year: '',
    sort: 'relevance'
  };

  let debounceTimer = null;

  async function fetchPublishedStats() {
    const statusEl = document.getElementById('dataSearchStatus');
    const resultsEl = document.getElementById('dataSearchResults');
    if (!resultsEl) return;

    if (statusEl) {
      statusEl.innerHTML = '<span class="data-loading-spinner">Recherche des données officielles en cours...</span>';
    }

    const queryParams = new URLSearchParams();
    if (currentFilters.q) queryParams.set('q', currentFilters.q);
    if (currentFilters.category) queryParams.set('category', currentFilters.category);
    if (currentFilters.territory) queryParams.set('territory', currentFilters.territory);
    if (currentFilters.year) queryParams.set('year', currentFilters.year);
    if (currentFilters.sort) queryParams.set('sort', currentFilters.sort);
    queryParams.set('limit', '50');

    try {
      const res = await fetch(`/api/data/search?${queryParams.toString()}`);
      const json = await res.json();

      if (!json.success) {
        if (statusEl) statusEl.textContent = json.error || 'Erreur lors de la recherche';
        return;
      }

      renderResults(json.data || [], json.meta || {});
    } catch (err) {
      console.error('Erreur fetchPublishedStats:', err);
      if (statusEl) statusEl.textContent = 'Erreur réseau lors de la consultation des statistiques';
    }
  }

  function renderResults(records, meta) {
    const statusEl = document.getElementById('dataSearchStatus');
    const resultsEl = document.getElementById('dataSearchResults');
    if (!resultsEl) return;

    resultsEl.innerHTML = '';

    const count = meta.total || records.length;
    if (statusEl) {
      if (count === 0) {
        statusEl.innerHTML = `Aucune observation statistique publiée ne correspond à ces critères. <em>(Rappel : les brouillons et travaux d'audit en cours sont strictement protégés)</em>`;
      } else {
        statusEl.innerHTML = `<strong>${count}</strong> observation${count > 1 ? 's' : ''} statistique${count > 1 ? 's' : ''} officielle${count > 1 ? 's' : ''} certifiée${count > 1 ? 's' : ''} :`;
      }
    }

    if (records.length === 0) return;

    const listContainer = document.createElement('div');
    listContainer.className = 'data-stat-results-list';

    records.forEach(obs => {
      const card = document.createElement('div');
      card.className = 'data-stat-result-card';

      const isEstimation = obs.is_estimation;
      const statusBadge = isEstimation
        ? `<span class="stat-badge badge-warning" title="Donnée estimée sujette à révision officielle">⚠️ Estimation / Projection</span>`
        : `<span class="stat-badge badge-success" title="Donnée issue de comptes définitifs ou recensement">✓ Donnée certifiée</span>`;

      const sourceTxt = (obs.sources || []).map(s => escapeHtml(s.source_name || s.source_acronym)).join(', ') || 'Source officielle certifiée';

      card.innerHTML = `
        <div class="stat-card-header">
          <div class="stat-card-meta">
            <span class="stat-category-pill">${escapeHtml(obs.indicator_category || 'Général')}</span>
            <span class="stat-code-pill">${escapeHtml(obs.indicator_code)}</span>
            <span class="stat-territory-pill">📍 ${escapeHtml(obs.territory_name)}</span>
          </div>
          ${statusBadge}
        </div>

        <div class="stat-card-body">
          <h4 class="stat-card-title">${escapeHtml(obs.indicator_name)}</h4>
          <div class="stat-value-display">
            <span class="stat-number">${formatNumber(obs.value_numeric)}</span>
            <span class="stat-unit">${escapeHtml(obs.unit)}</span>
            <span class="stat-period-tag">${escapeHtml(obs.period_type)} ${escapeHtml(obs.period_year || '')}</span>
          </div>
          ${obs.audit_caveat ? `<div class="stat-caveat-box"><strong>Réserve méthodologique :</strong> ${escapeHtml(obs.audit_caveat)}</div>` : ''}
          <div class="stat-sources-ref">
            <small><strong>Source :</strong> ${sourceTxt}</small>
          </div>
        </div>

        <div class="stat-card-actions">
          <button type="button" class="btn-action-primary btn-open-modal" data-code="${escapeHtml(obs.indicator_code)}">
            Consulter la fiche complète &amp; Historique &rarr;
          </button>
          <div class="stat-card-downloads">
            <span class="download-label">Télécharger :</span>
            <a href="/api/data/indicators/${escapeHtml(obs.indicator_code)}/export/csv" class="btn-pill-download" download title="Format tableur CSV avec BOM UTF-8">CSV</a>
            <a href="/api/data/indicators/${escapeHtml(obs.indicator_code)}/export/json" class="btn-pill-download" download title="JSON structuré">JSON</a>
            <a href="/api/data/indicators/${escapeHtml(obs.indicator_code)}/export/json-ld" class="btn-pill-download" download title="JSON-LD Schema.org">JSON-LD</a>
          </div>
        </div>
      `;

      listContainer.appendChild(card);
    });

    resultsEl.appendChild(listContainer);

    // Attacher écouteurs sur boutons "Consulter la fiche"
    listContainer.querySelectorAll('.btn-open-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-code');
        if (code) openIndicatorModal(code);
      });
    });
  }

  async function openIndicatorModal(indicatorCode) {
    let modal = document.getElementById('indicatorDetailModal');
    if (!modal) {
      modal = createModalElement();
      document.body.appendChild(modal);
    }

    const modalBody = modal.querySelector('.modal-dynamic-body');
    if (modalBody) {
      modalBody.innerHTML = '<div class="modal-loading-state">Chargement de la fiche d\'indicateur et de ses publications auditées...</div>';
    }

    modal.classList.add('is-active');
    document.body.classList.add('modal-open');

    try {
      const res = await fetch(`/api/data/indicators/${encodeURIComponent(indicatorCode)}`);
      const json = await res.json();

      if (!json.success || !json.data) {
        if (modalBody) modalBody.innerHTML = `<div class="modal-error-state">Impossible de charger l'indicateur : ${escapeHtml(json.error || 'Indicateur introuvable')}</div>`;
        return;
      }

      renderModalContent(modalBody, json.data);
    } catch (err) {
      console.error('Erreur chargement indicateur modal:', err);
      if (modalBody) modalBody.innerHTML = '<div class="modal-error-state">Erreur réseau lors du chargement de la fiche.</div>';
    }
  }

  function renderModalContent(container, ind) {
    const publications = ind.publications || [];
    const history = ind.published_history || [];

    const pubsHtml = publications.length > 0
      ? `<div class="modal-pubs-list">
          ${publications.map(p => `
            <div class="modal-pub-item">
              <div class="pub-title-row">
                <strong>${escapeHtml(p.title)}</strong>
                <span class="pub-tier-tag">${escapeHtml(p.documentary_tier || 'TIER_1')}</span>
              </div>
              <div class="pub-meta-row">
                <span>Institution : ${escapeHtml(p.institution_name)} (${escapeHtml(p.institution_acronym)})</span>
                <span>Année : ${escapeHtml(p.publication_year || '-')}</span>
                <span>Statut : ${escapeHtml(p.verification_status)}</span>
              </div>
              ${p.specific_section ? `<div class="pub-section">Section spécifique : <em>${escapeHtml(p.specific_section)}</em></div>` : ''}
              ${p.bibliographic_reference ? `<div class="pub-biblio"><small>${escapeHtml(p.bibliographic_reference)}</small></div>` : ''}
              ${p.url ? `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer" class="pub-link">Consulter la ressource officielle &nearr;</a>` : ''}
            </div>
          `).join('')}
        </div>`
      : `<p class="empty-state-text">Aucun document spécifique rattaché à cet indicateur.</p>`;

    const historyHtml = history.length > 0
      ? `<table class="modal-history-table">
          <thead>
            <tr>
              <th>Période</th>
              <th>Territoire</th>
              <th>Valeur</th>
              <th>Statut &amp; Nature</th>
              <th>Réserves / Notes</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(h => `
              <tr class="${h.is_estimation ? 'row-estimation' : 'row-definitif'}">
                <td><strong>${escapeHtml(h.period_type)} ${escapeHtml(h.period_year || h.period_start)}</strong></td>
                <td>${escapeHtml(h.territory_name)} (${escapeHtml(h.territory_code)})</td>
                <td><span class="table-stat-val">${formatNumber(h.value_numeric)}</span> <small>${escapeHtml(h.unit)}</small></td>
                <td>
                  <span class="table-status-pill ${h.is_estimation ? 'pill-warning' : 'pill-success'}">
                    ${escapeHtml(h.estimation_status_label)}
                  </span>
                  <br><small class="method-sub">${escapeHtml(h.methodology_nature || '')}</small>
                </td>
                <td>
                  ${h.audit_caveat ? `<span class="table-caveat-text">⚠️ ${escapeHtml(h.audit_caveat)}</span>` : '<span class="text-muted">Aucune réserve particulière</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>`
      : `<p class="empty-state-text">Aucune observation publiée pour l'instant pour cet indicateur.</p>`;

    container.innerHTML = `
      <div class="modal-ind-header">
        <div class="modal-ind-tags">
          <span class="modal-tag-category">${escapeHtml(ind.category)}</span>
          <span class="modal-tag-code">${escapeHtml(ind.code)}</span>
          <span class="modal-tag-unit">Unité : ${escapeHtml(ind.unit)}</span>
          <span class="modal-tag-period">Périodicité : ${escapeHtml(ind.expected_periodicity || 'ANNUAL')}</span>
        </div>
        <h3 class="modal-ind-title">${escapeHtml(ind.name)}</h3>
        <p class="modal-ind-desc">${escapeHtml(ind.description || 'Définition institutionnelle de référence.')}</p>
      </div>

      <div class="modal-ind-grid">
        <div class="modal-card-meta-box">
          <h5>Méthode de calcul &amp; Production</h5>
          <p><strong>Formule :</strong> ${escapeHtml(ind.calculation_formula || 'Non applicable (comptage direct ou agrégat brut)')}</p>
          <p><strong>Institution productrice :</strong> ${escapeHtml(ind.producer_institution || 'INS Cameroun')}</p>
          <p><strong>Niveaux géographiques :</strong> ${Array.isArray(ind.geographical_levels) ? ind.geographical_levels.join(', ') : 'National'}</p>
        </div>

        <div class="modal-card-meta-box warning-box">
          <h5>Limites &amp; Réserves Méthodologiques</h5>
          <p>${escapeHtml(ind.methodological_limitations || 'Aucune limite méthodologique majeure signalée.')}</p>
        </div>
      </div>

      <div class="modal-section-title">
        <h4>Corpus documentaire &amp; Sources publiques rattachées</h4>
      </div>
      ${pubsHtml}

      <div class="modal-section-title">
        <h4>Historique des observations publiées</h4>
      </div>
      <div class="modal-table-responsive">
        ${historyHtml}
      </div>

      <div class="modal-footer-exports">
        <span>Exporter la série complète de cet indicateur :</span>
        <a href="/api/data/indicators/${escapeHtml(ind.code)}/export/csv" class="btn-modal-export" download>Télécharger CSV</a>
        <a href="/api/data/indicators/${escapeHtml(ind.code)}/export/json" class="btn-modal-export" download>Télécharger JSON</a>
        <a href="/api/data/indicators/${escapeHtml(ind.code)}/export/json-ld" class="btn-modal-export" download>Télécharger JSON-LD</a>
      </div>
    `;
  }

  function createModalElement() {
    const modal = document.createElement('div');
    modal.id = 'indicatorDetailModal';
    modal.className = 'data-modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="data-modal-container">
        <button type="button" class="data-modal-close" id="modalCloseBtn" aria-label="Fermer la modal">&times;</button>
        <div class="modal-dynamic-body"></div>
      </div>
    `;

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    const closeBtn = modal.querySelector('#modalCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('is-active')) {
        closeModal();
      }
    });

    return modal;
  }

  function closeModal() {
    const modal = document.getElementById('indicatorDetailModal');
    if (modal) modal.classList.remove('is-active');
    document.body.classList.remove('modal-open');
  }

  function triggerFilteredExport(format) {
    const queryParams = new URLSearchParams();
    if (currentFilters.q) queryParams.set('q', currentFilters.q);
    if (currentFilters.category) queryParams.set('category', currentFilters.category);
    if (currentFilters.territory) queryParams.set('territory', currentFilters.territory);
    if (currentFilters.year) queryParams.set('year', currentFilters.year);

    const url = `/api/data/export/${format}?${queryParams.toString()}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('dataSearchInput');
    const filterDomain = document.getElementById('filterDomain');
    const filterTerritory = document.getElementById('filterTerritory');
    const filterYear = document.getElementById('filterYear');

    const btnExportCsv = document.getElementById('btnExportCsv');
    const btnExportJson = document.getElementById('btnExportJson');
    const btnExportJsonLd = document.getElementById('btnExportJsonLd');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          currentFilters.q = searchInput.value.trim();
          fetchPublishedStats();
        }, 300);
      });
    }

    if (filterDomain) {
      filterDomain.addEventListener('change', () => {
        currentFilters.category = filterDomain.value;
        fetchPublishedStats();
      });
    }

    if (filterTerritory) {
      filterTerritory.addEventListener('change', () => {
        currentFilters.territory = filterTerritory.value;
        fetchPublishedStats();
      });
    }

    if (filterYear) {
      filterYear.addEventListener('change', () => {
        currentFilters.year = filterYear.value;
        fetchPublishedStats();
      });
    }

    if (btnExportCsv) {
      btnExportCsv.addEventListener('click', () => triggerFilteredExport('csv'));
    }
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => triggerFilteredExport('json'));
    }
    if (btnExportJsonLd) {
      btnExportJsonLd.addEventListener('click', () => triggerFilteredExport('json-ld'));
    }

    // Chargement initial des statistiques publiées
    fetchPublishedStats();
  });
})();

