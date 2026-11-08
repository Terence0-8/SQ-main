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
    queryParams.set('exclude_tests', 'true');

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
        statusEl.innerHTML = `<strong>${count}</strong> observation${count > 1 ? 's' : ''} statistique${count > 1 ? 's' : ''} officielle${count > 1 ? 's' : ''} répertoriée${count > 1 ? 's' : ''} :`;
      }
    }

    if (records.length === 0) return;

    const listContainer = document.createElement('div');
    listContainer.className = 'data-stat-results-list';

    records.forEach(obs => {
      const card = document.createElement('div');
      card.className = 'data-stat-result-card';

      const isEstimation = Boolean(obs.is_estimation || (obs.statistical_nature && (obs.statistical_nature.code === 'estimate' || obs.statistical_nature.code === 'projection')));
      const natureLabel = obs.estimation_status_label || (isEstimation ? 'Projection / Estimation' : 'Donnée définitive');
      const statusBadge = isEstimation
        ? `<span class="stat-badge badge-warning" title="Donnée estimée ou projetée sujette à révision officielle">⚠️ ${escapeHtml(natureLabel)}</span>`
        : `<span class="stat-badge badge-success" title="Donnée officielle issue de comptes clos ou recensement vérifié">✓ ${escapeHtml(natureLabel)}</span>`;

      const sourceTxt = (obs.sources || []).map(s => escapeHtml(s.source_name || s.source_acronym)).join(', ') || 'Source institutionnelle officielle';

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
            Consulter la fiche citoyenne &amp; Historique &rarr;
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

    // Synchronisation avec l'URL pour partage direct et intégration recherche
    try {
      if (window.location.hash !== `#indicator-${indicatorCode}`) {
        window.history.replaceState(null, null, `#indicator-${indicatorCode}`);
      }
    } catch {
      // Ignorer si indisponible
    }

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

  /**
   * Générateur de visualisation graphique SVG adaptée (Lot 3E.4)
   * Règle impérative : Ne pas relier artificiellement des données non comparables.
   * Distinction visuelle rigoureuse entre données définitives et projections/estimations.
   */
  function renderSeriesChart(history, unit) {
    if (!Array.isArray(history) || history.length === 0) return '';

    // Filtrer et trier par date chronologique croissante
    const sorted = [...history]
      .filter(h => h.value_numeric !== null && !isNaN(h.value_numeric))
      .sort((a, b) => new Date(a.period_start || a.period_year) - new Date(b.period_start || b.period_year));

    if (sorted.length === 0) return '';

    // 1. Cas d'une observation unique : Baromètre / Repère KPI annuel sans fausse extrapolation
    if (sorted.length === 1) {
      const obs = sorted[0];
      const isEst = obs.is_estimation;
      return `
        <div class="stat-chart-single-kpi" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:18px; margin:14px 0 20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
          <div>
            <div style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:#64748b; letter-spacing:0.5px;">Repère Annuel Officiel Unique</div>
            <div style="font-size:1.8rem; font-weight:800; font-family:'Playfair Display', serif; color:#0f172a; margin-top:4px;">
              ${formatNumber(obs.value_numeric)} <span style="font-size:1rem; font-weight:500; font-family:'Inter', sans-serif; color:#475569;">${escapeHtml(unit || obs.unit)}</span>
            </div>
            <div style="font-size:0.82rem; color:#64748b; margin-top:4px;">
              Période : <strong>${escapeHtml(obs.period_type)} ${escapeHtml(obs.period_year || '')}</strong> • Territoire : <strong>${escapeHtml(obs.territory_name)}</strong>
            </div>
          </div>
          <div style="text-align:right;">
            <span class="stat-badge ${isEst ? 'badge-warning' : 'badge-success'}" style="font-size:0.8rem; padding:6px 12px;">
              ${isEst ? '⚠️ ' + escapeHtml(obs.estimation_status_label || 'Estimation / Projection') : '✓ ' + escapeHtml(obs.estimation_status_label || 'Donnée définitive')}
            </span>
            <div style="font-size:0.75rem; color:#64748b; margin-top:6px;">
              Méthodologie : <em>${escapeHtml(obs.methodology_nature || 'officielle')}</em>
            </div>
          </div>
        </div>
      `;
    }

    // 2. Cas multi-observations : Graphique temporel SVG responsive avec distinction des séries
    const width = 640;
    const height = 230;
    const padLeft = 65;
    const padRight = 35;
    const padTop = 30;
    const padBottom = 40;

    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;

    const values = sorted.map(d => Number(d.value_numeric));
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);
    if (minVal === maxVal) {
      minVal = minVal * 0.9;
      maxVal = maxVal * 1.1;
    } else {
      const margin = (maxVal - minVal) * 0.12;
      minVal = Math.max(0, minVal - margin);
      maxVal = maxVal + margin;
    }

    const getX = (idx) => padLeft + (idx / (sorted.length - 1)) * chartW;
    const getY = (val) => padTop + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;

    // Tracé des segments avec distinction (ligne continue si certifié -> certifié, tiretée si projection)
    let segmentsSvg = '';
    for (let i = 0; i < sorted.length - 1; i++) {
      const p1 = sorted[i];
      const p2 = sorted[i + 1];
      const x1 = getX(i);
      const y1 = getY(Number(p1.value_numeric));
      const x2 = getX(i + 1);
      const y2 = getY(Number(p2.value_numeric));

      const isProjectedSegment = Boolean(p1.is_estimation || p2.is_estimation);
      const strokeDash = isProjectedSegment ? 'stroke-dasharray="6,4"' : '';
      const strokeColor = isProjectedSegment ? '#d97706' : '#15803d';

      segmentsSvg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="2.5" ${strokeDash} />`;
    }

    // Points et étiquettes
    let pointsSvg = '';
    sorted.forEach((p, idx) => {
      const cx = getX(idx);
      const cy = getY(Number(p.value_numeric));
      const isEst = p.is_estimation;
      const color = isEst ? '#d97706' : '#15803d';
      const labelYear = p.period_year || (p.period_start ? new Date(p.period_start).getFullYear() : `P${idx + 1}`);

      pointsSvg += `
        <g class="chart-point-group" tabindex="0">
          <circle cx="${cx}" cy="${cy}" r="6" fill="${isEst ? '#fff' : color}" stroke="${color}" stroke-width="2.5" />
          <text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="11" font-weight="700" fill="#1e293b">
            ${formatNumber(p.value_numeric)}
          </text>
          <text x="${cx}" y="${height - padBottom + 18}" text-anchor="middle" font-size="11" font-weight="600" fill="#64748b">
            ${escapeHtml(labelYear)}
          </text>
          <title>${labelYear} : ${formatNumber(p.value_numeric)} ${unit || ''} (${isEst ? 'Projection / Estimation' : 'Donnée certifiée'})</title>
        </g>
      `;
    });

    // Lignes de repère horizontales
    let gridSvg = '';
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const tickVal = minVal + (i / yTicks) * (maxVal - minVal);
      const y = padTop + chartH - (i / yTicks) * chartH;
      gridSvg += `
        <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
        <text x="${padLeft - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#94a3b8">${formatNumber(tickVal)}</text>
      `;
    }

    return `
      <div class="stat-series-chart-container" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:16px; margin:14px 0 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
          <h5 style="margin:0; font-size:0.9rem; color:#0f172a; font-weight:700;">Évolution chronologique de la série</h5>
          <div style="display:flex; gap:14px; font-size:0.75rem; color:#475569; align-items:center;">
            <span style="display:inline-flex; align-items:center; gap:5px;">
              <span style="display:inline-block; width:14px; height:3px; background:#15803d;"></span> Donnée certifiée
            </span>
            <span style="display:inline-flex; align-items:center; gap:5px;">
              <span style="display:inline-block; width:14px; height:0px; border-top:2px dashed #d97706;"></span> Projection / Estimation
            </span>
          </div>
        </div>
        <div style="width:100%; overflow-x:auto;">
          <svg viewBox="0 0 ${width} ${height}" style="width:100%; max-width:${width}px; height:auto; display:block; margin:0 auto;" aria-label="Graphique d'évolution chronologique">
            ${gridSvg}
            ${segmentsSvg}
            ${pointsSvg}
          </svg>
        </div>
        <div style="font-size:0.72rem; color:#64748b; font-style:italic; margin-top:8px; text-align:right;">
          * Note méthodologique : les liaisons en tiretés signalent une projection ou une rupture de nature statistique.
        </div>
      </div>
    `;
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

    const latestObs = history.length > 0 ? history[history.length - 1] : null;

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

      <!-- Module des 5 Repères Citoyens (Lot 3H) -->
      <div class="modal-citizen-guide" style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:10px; padding:18px; margin:16px 0 20px;">
        <h4 style="margin:0 0 12px; font-size:1rem; color:#1e293b; display:flex; align-items:center; gap:8px;">
          <span>📘</span> Comprendre cette donnée : Les 5 repères citoyens
        </h4>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
            <div style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:#475569;">1. Que mesure cet indicateur ?</div>
            <div style="font-size:0.88rem; color:#0f172a; margin-top:4px;">${escapeHtml(ind.description || ind.name)}</div>
          </div>
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
            <div style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:#475569;">2. Que signifie le chiffre affiché ?</div>
            <div style="font-size:0.88rem; color:#0f172a; margin-top:4px;">
              Exprimé en <strong>${escapeHtml(ind.unit)}</strong>. ${latestObs ? 'Repère récent : <strong>' + formatNumber(latestObs.value_numeric) + ' ' + escapeHtml(ind.unit) + '</strong> (' + (latestObs.period_year || latestObs.period_start || '') + ').' : 'Consultez la série ci-dessous.'}
            </div>
          </div>
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
            <div style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:#475569;">3. Sur quelle période porte-t-il ?</div>
            <div style="font-size:0.88rem; color:#0f172a; margin-top:4px;">
              Fréquence : <strong>${escapeHtml(ind.expected_periodicity || 'Annuelle')}</strong>. ${latestObs ? 'Dernier exercice officiel : <strong>' + (latestObs.period_type || 'Année') + ' ' + (latestObs.period_year || latestObs.period_start || '') + '</strong>.' : 'Période variable.'}
            </div>
          </div>
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
            <div style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:#475569;">4. Qui a produit cette information ?</div>
            <div style="font-size:0.88rem; color:#0f172a; margin-top:4px;">
              Institution productrice : <strong>${escapeHtml(ind.producer_institution || 'Institut National de la Statistique (INS Cameroun)')}</strong>.
            </div>
          </div>
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px; grid-column:1 / -1;">
            <div style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:#b45309;">5. Quelles sont ses limites ou réserves méthodologiques ?</div>
            <div style="font-size:0.88rem; color:#78350f; margin-top:4px;">
              ${escapeHtml(ind.methodological_limitations || 'Donnée soumise aux révisions statistiques institutionnelles usuelles et aux décalages de consolidation des comptes.')}
            </div>
          </div>
        </div>
      </div>

      <div class="modal-ind-grid">
        <div class="modal-card-meta-box">
          <h5>Méthode de calcul &amp; Production</h5>
          <p><strong>Formule :</strong> ${escapeHtml(ind.calculation_formula || 'Comptage direct consolidé ou agrégat brut selon les normes statistiques.')}</p>
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

      ${history.length > 0 ? `
        <div class="modal-section-title">
          <h4>Visualisation graphique de la série chronologique</h4>
        </div>
        ${renderSeriesChart(history, ind.unit)}
      ` : ''}

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

    // Réinitialiser le hash d'indicateur sans recharger la page
    try {
      if (window.location.hash && window.location.hash.startsWith('#indicator-')) {
        window.history.replaceState(null, null, window.location.pathname + window.location.search);
      }
    } catch {
      // Ignorer si indisponible
    }
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

    // Détection d'un hash indicateur direct au chargement (intégration recherche globale Solitiquo)
    const checkHashAndOpen = () => {
      const hash = window.location.hash || '';
      if (hash.startsWith('#indicator-')) {
        const code = hash.replace('#indicator-', '').trim();
        if (code) {
          setTimeout(() => openIndicatorModal(code), 150);
        }
      }
    };

    checkHashAndOpen();
    window.addEventListener('hashchange', checkHashAndOpen);
  });
})();

