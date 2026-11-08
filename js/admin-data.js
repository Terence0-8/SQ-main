/**
 * =============================================================================
 * SOLITIQUO DATA — MODULE D'ADMINISTRATION STATISTIQUE (Lot 2C.1)
 * Refonte UX/UI Complète : Architecture 8 Vues, Formulaire 5 Étapes, Dossiers Dédiés
 * =============================================================================
 */

(function (window) {
  'use strict';

  const DATA_API_BASE = (window.API_URL || '/api') + '/data';

  // ---------------------------------------------------------------------------
  // 1. ADAPTATEUR D'API SÉCURISÉ (LOTS 2A & 2B)
  // ---------------------------------------------------------------------------
  const DataAdminAPI = {
    async getCsrf() {
      if (window.SolitiquoAPI && window.SolitiquoAPI.csrfToken) {
        return window.SolitiquoAPI.csrfToken;
      }
      try {
        const res = await fetch('/api/csrf-token', { credentials: 'include' });
        if (res.ok) {
          const json = await res.json();
          if (json.csrfToken) {
            if (window.SolitiquoAPI) window.SolitiquoAPI.csrfToken = json.csrfToken;
            return json.csrfToken;
          }
        }
      } catch (e) {
        console.warn('Impossible de récupérer le jeton CSRF', e);
      }
      return '';
    },

    async request(url, options = {}) {
      options.credentials = 'include';
      options.headers = options.headers || {};

      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes((options.method || 'GET').toUpperCase())) {
        const token = await this.getCsrf();
        if (token) options.headers['X-CSRF-Token'] = token;
        if (!options.headers['Content-Type'] && !(options.body instanceof FormData)) {
          options.headers['Content-Type'] = 'application/json';
        }
      }

      const res = await fetch(url, options);
      const json = await res.json().catch(() => ({ success: false, error: 'Réponse serveur invalide' }));

      if (!res.ok) {
        const err = new Error(json.error || `Erreur HTTP ${res.status}`);
        err.status = res.status;
        err.details = json;
        throw err;
      }
      return json;
    },

    // Référentiels
    getTerritories() { return this.request(`${DATA_API_BASE}/territories`); },
    getIndicators() { return this.request(`${DATA_API_BASE}/indicators`); },
    getSources() { return this.request(`${DATA_API_BASE}/sources`); },
    getBreakdownReferentials() { return this.request(`${DATA_API_BASE}/admin/referentials/breakdowns`); },

    // Statistiques, Audit et Répertoire
    getStats(query = '') { return this.request(`${DATA_API_BASE}/admin/stats${query}`); },
    getAuditLog(query = '') { return this.request(`${DATA_API_BASE}/admin/audit-log${query}`); },
    getSourcesStats() { return this.request(`${DATA_API_BASE}/admin/sources-stats`); },

    // Corpus Documentaire (Lot 3B)
    getDocumentaryPublications(query = '') { return this.request(`${DATA_API_BASE}/admin/publications${query}`); },
    getDocumentaryPublication(id) { return this.request(`${DATA_API_BASE}/admin/publications/${id}`); },
    getDocumentaryStats() { return this.request(`${DATA_API_BASE}/admin/publications/stats`); },
    getUncoveredIndicators() { return this.request(`${DATA_API_BASE}/admin/publications/uncovered-indicators`); },
    createDocumentaryPublication(data) {
      return this.request(`${DATA_API_BASE}/admin/publications`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    updateDocumentaryPublication(id, data) {
      return this.request(`${DATA_API_BASE}/admin/publications/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },
    deleteDocumentaryPublication(id) {
      return this.request(`${DATA_API_BASE}/admin/publications/${id}`, {
        method: 'DELETE'
      });
    },

    // Observations administratives
    getObservations(query = '') { return this.request(`${DATA_API_BASE}/admin/values${query}`); },
    getObservation(id) { return this.request(`${DATA_API_BASE}/admin/values/${id}`); },
    getObservationHistory(id) { return this.request(`${DATA_API_BASE}/admin/values/${id}/history`); },

    // Mutations du Workflow Éditorial
    createDraft(data) {
      return this.request(`${DATA_API_BASE}/admin/values`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    updateDraft(id, data) {
      return this.request(`${DATA_API_BASE}/admin/values/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },
    addSource(valId, srcData) {
      return this.request(`${DATA_API_BASE}/admin/values/${valId}/sources`, {
        method: 'POST',
        body: JSON.stringify(srcData)
      });
    },
    removeSource(valId, srcId) {
      return this.request(`${DATA_API_BASE}/admin/values/${valId}/sources/${srcId}`, {
        method: 'DELETE'
      });
    },
    addBreakdown(valId, brkData) {
      return this.request(`${DATA_API_BASE}/admin/values/${valId}/breakdowns`, {
        method: 'POST',
        body: JSON.stringify(brkData)
      });
    },
    removeBreakdown(valId, brkId) {
      return this.request(`${DATA_API_BASE}/admin/values/${valId}/breakdowns/${brkId}`, {
        method: 'DELETE'
      });
    },
    submitForReview(id) {
      return this.request(`${DATA_API_BASE}/admin/values/${id}/submit`, { method: 'POST', body: '{}' });
    },
    validateMethodology(id, validationNotes) {
      return this.request(`${DATA_API_BASE}/admin/values/${id}/validate`, {
        method: 'POST',
        body: JSON.stringify({ validation_notes: validationNotes })
      });
    },
    decideAudit(id, decision, notes, evidence_url, evidence_reference) {
      return this.request(`${DATA_API_BASE}/admin/values/${id}/audit-decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, notes, evidence_url, evidence_reference })
      });
    },
    requestCorrection(id, correctionNotes) {
      return this.request(`${DATA_API_BASE}/admin/values/${id}/request-correction`, {
        method: 'POST',
        body: JSON.stringify({ correction_notes: correctionNotes })
      });
    },
    rejectObservation(id, rejectionReason) {
      return this.request(`${DATA_API_BASE}/admin/values/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejection_reason: rejectionReason })
      });
    },
    publishObservation(id, summary) {
      return this.request(`${DATA_API_BASE}/admin/values/${id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ public_reason_summary: summary })
      });
    },
    reviseObservation(id, reason) {
      return this.request(`${DATA_API_BASE}/admin/values/${id}/revise`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    revokeObservation(id, reason) {
      return this.request(`${DATA_API_BASE}/admin/values/${id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
    },
    archiveObservation(id) {
      return this.request(`${DATA_API_BASE}/admin/values/${id}/archive`, { method: 'POST', body: '{}' });
    },

    // Module d'Importation (Lot 2D)
    async uploadImportFile(file) {
      const csrf = await getCsrfToken();
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${DATA_API_BASE}/admin/imports/upload`, {
        method: 'POST',
        headers: {
          'x-csrf-token': csrf
        },
        body: formData
      });
      const json = await res.json();
      if (!res.ok) {
        const err = new Error(json.error || `Erreur HTTP ${res.status}`);
        err.status = res.status;
        err.details = json;
        throw err;
      }
      return json;
    },
    validateImportMapping(batchId, payload) {
      return this.request(`${DATA_API_BASE}/admin/imports/${batchId}/validate`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    },
    applyImportBatch(batchId) {
      return this.request(`${DATA_API_BASE}/admin/imports/${batchId}/apply`, {
        method: 'POST',
        body: '{}'
      });
    },
    getImportBatches(limit = 20, offset = 0) {
      return this.request(`${DATA_API_BASE}/admin/imports?limit=${limit}&offset=${offset}`);
    },
    getImportBatch(batchId) {
      return this.request(`${DATA_API_BASE}/admin/imports/${batchId}`);
    }
  };

  // ---------------------------------------------------------------------------
  // 2. ÉTAT GLOBAL (STATE) & CONSTANTES
  // ---------------------------------------------------------------------------
  const State = {
    currentUser: null,
    activeTab: 'dashboard',
    previousTab: 'observations',
    excludeTests: true,
    referentials: {
      territories: [],
      indicators: [],
      sources: [],
      dimensions: []
    },
    importWizard: {
      currentStep: 1,
      selectedFile: null,
      batch: null,
      headers: [],
      previewRows: [],
      mapping: {},
      defaults: {},
      validationResult: null
    },
    filters: {
      page: 1,
      limit: 15,
      editorial_status: '',
      indicator_id: '',
      territory_id: '',
      search: ''
    },
    pagination: {
      total: 0,
      totalPages: 1,
      currentPage: 1
    },
    auditFilters: {
      page: 1,
      limit: 15,
      action: '',
      data_value_id: ''
    },
    auditPagination: {
      total: 0,
      totalPages: 1,
      currentPage: 1
    },
    activeRefTab: 'indicators',
    documentary: {
      activeSubTab: 'publications',
      publications: [],
      uncoveredIndicators: [],
      institutions: [],
      stats: null,
      filters: {
        search: '',
        institution_id: '',
        category: '',
        verification_status: ''
      }
    },
    selectedValidationId: null,
    validationFilter: 'pilot',
    validationSearch: '',
    validationQueueCache: [],

    // État du formulaire de saisie en 5 étapes
    editor: {
      currentStep: 1,
      isEdit: false,
      editId: null,
      data: {
        indicator_id: '',
        territory_id: '',
        public_reason_summary: '',
        period_type: 'ANNUAL',
        period_start: '2024-01-01',
        period_end: '2024-12-31',
        methodology_nature: 'administrative_record',
        methodology_notes: '',
        internal_notes: '',
        valueType: 'numeric',
        value_numeric: null,
        value_text: '',
        missing_reason: '',
        sources: [],
        breakdowns: []
      }
    }
  };

  const STATUS_META = {
    draft: { label: 'Brouillon', class: 'draft', icon: 'file-edit' },
    under_review: { label: 'En attente', class: 'under_review', icon: 'clock' },
    methodologically_validated: { label: 'Validée', class: 'methodologically_validated', icon: 'check-circle' },
    rejected: { label: 'Rejetée', class: 'rejected', icon: 'alert-triangle' },
    published: { label: 'Publiée', class: 'published', icon: 'globe' },
    superseded: { label: 'Remplacée', class: 'superseded', icon: 'history' },
    revoked: { label: 'Révoquée', class: 'revoked', icon: 'alert-octagon' },
    archived: { label: 'Archivée', class: 'archived', icon: 'archive' }
  };

  // ---------------------------------------------------------------------------
  // 3. FONCTIONS UTILITAIRES & FORMATEURS SÉCURISÉS
  // ---------------------------------------------------------------------------
  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Formate proprement une date sans jamais afficher 1970
   */
  function formatDate(d, includeTime = false) {
    if (!d) return '—';
    const parsed = new Date(d);
    if (isNaN(parsed.getTime()) || parsed.getFullYear() <= 1970) return '—';
    return includeTime
      ? parsed.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : parsed.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function formatNumber(val) {
    if (val === null || val === undefined || val === '') return '—';
    const n = Number(val);
    if (isNaN(n)) return escapeHTML(val);
    return n.toLocaleString('fr-FR');
  }

  function getStatusBadge(status) {
    const meta = STATUS_META[status] || { label: status, class: 'draft', icon: 'help-circle' };
    return `<span class="status-badge ${meta.class}"><i data-lucide="${meta.icon}"></i> ${meta.label}</span>`;
  }

  function toast(icon, title) {
    if (window.Swal) {
      window.Swal.fire({
        icon,
        title,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });
    } else {
      console.log(`[Toast ${icon}] ${title}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. INITIALISATION DE L'ESPACE DATA
  // ---------------------------------------------------------------------------
  async function initDataAdmin(user) {
    State.currentUser = user || window._currentUser;

    // Charger les référentiels réels du socle
    try {
      const [tRes, iRes, sRes, dRes] = await Promise.all([
        DataAdminAPI.getTerritories(),
        DataAdminAPI.getIndicators(),
        DataAdminAPI.getSources(),
        DataAdminAPI.getBreakdownReferentials()
      ]);
      State.referentials.territories = tRes.data || [];
      State.referentials.indicators = iRes.data || [];
      State.referentials.sources = sRes.data || [];
      State.referentials.dimensions = dRes.data || [];

      populateFilterSelects();
      populateEditorSelects();
    } catch (e) {
      console.warn('Erreur lors du chargement des référentiels DATA:', e);
    }

    bindSubnavEvents();
    bindFilterEvents();
    bindEditorEvents();
    bindValidationEvents();
    bindAuditEvents();

    // Toggle "Données réelles uniquement"
    const toggleReal = document.getElementById('data-toggle-exclude-tests');
    if (toggleReal) {
      toggleReal.checked = State.excludeTests;
      toggleReal.addEventListener('change', () => {
        State.excludeTests = toggleReal.checked;
        refreshCurrentView();
      });
    }

    // Afficher l'onglet initial
    switchDataTab(State.activeTab);
  }

  function bindSubnavEvents() {
    document.querySelectorAll('.data-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (tab === 'editor') {
          openEditor(null);
        } else {
          switchDataTab(tab);
        }
      });
    });
  }

  function switchDataTab(tabName) {
    if (State.activeTab !== 'detail' && State.activeTab !== 'editor') {
      State.previousTab = State.activeTab;
    }
    State.activeTab = tabName;

    // Mettre à jour les boutons d'onglets
    document.querySelectorAll('.data-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabName);
    });

    // Mettre à jour les sections
    document.querySelectorAll('.data-tab-content').forEach(c => c.style.display = 'none');
    const target = document.getElementById(`data-view-${tabName}`);
    if (target) target.style.display = 'block';

    refreshCurrentView();
  }

  function refreshCurrentView() {
    if (State.activeTab === 'dashboard') loadDashboard();
    if (State.activeTab === 'observations') loadObservations();
    if (State.activeTab === 'validation') loadValidationQueue();
    if (State.activeTab === 'publications') loadPublications();
    if (State.activeTab === 'sources') loadSourcesDirectory();
    if (State.activeTab === 'referentials') loadReferentials();
    if (State.activeTab === 'audit') loadAuditLog();
    if (State.activeTab === 'import') initImportView();

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 40);
  }

  function populateFilterSelects() {
    const indSelect = document.getElementById('data-filter-indicator');
    if (indSelect) {
      const activeIndicators = State.excludeTests
        ? State.referentials.indicators.filter(i => !i.code.startsWith('IND_') && !i.name.startsWith('Indicateur '))
        : State.referentials.indicators;

      indSelect.innerHTML = '<option value="">Tous les indicateurs</option>' +
        activeIndicators.map(i => `<option value="${i.id}">${escapeHTML(i.name)} (${escapeHTML(i.code)})</option>`).join('');
    }

    const terSelect = document.getElementById('data-filter-territory');
    if (terSelect) {
      terSelect.innerHTML = '<option value="">Tous les territoires</option>' +
        State.referentials.territories.map(t => `<option value="${t.id}">${escapeHTML(t.name)} (${escapeHTML(t.code)})</option>`).join('');
    }
  }

  function bindFilterEvents() {
    const statusSelect = document.getElementById('data-filter-status');
    const indSelect = document.getElementById('data-filter-indicator');
    const terSelect = document.getElementById('data-filter-territory');
    const searchInput = document.getElementById('data-filter-search');
    const resetBtn = document.getElementById('btn-reset-filters');

    const triggerRefresh = () => {
      State.filters.page = 1;
      State.filters.editorial_status = statusSelect ? statusSelect.value : '';
      State.filters.indicator_id = indSelect ? indSelect.value : '';
      State.filters.territory_id = terSelect ? terSelect.value : '';
      State.filters.search = searchInput ? searchInput.value.trim().toLowerCase() : '';
      loadObservations();
    };

    if (statusSelect) statusSelect.addEventListener('change', triggerRefresh);
    if (indSelect) indSelect.addEventListener('change', triggerRefresh);
    if (terSelect) terSelect.addEventListener('change', triggerRefresh);

    if (searchInput) {
      let debounce;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(triggerRefresh, 300);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (statusSelect) statusSelect.value = '';
        if (indSelect) indSelect.value = '';
        if (terSelect) terSelect.value = '';
        if (searchInput) searchInput.value = '';
        triggerRefresh();
      });
    }

    // Pagination Observations
    const prevBtn = document.getElementById('data-page-prev');
    const nextBtn = document.getElementById('data-page-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (State.filters.page > 1) {
          State.filters.page--;
          loadObservations();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (State.filters.page < State.pagination.totalPages) {
          State.filters.page++;
          loadObservations();
        }
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 5. VUE 1 : TABLEAU DE BORD DATA (INDICATEURS, ACTIONS, PUBLICATIONS, AUDIT)
  // ---------------------------------------------------------------------------
  async function loadDashboard() {
    try {
      const q = State.excludeTests ? '?exclude_tests=true' : '';
      const statsRes = await DataAdminAPI.getStats(q);
      const stats = statsRes.data || {};
      const counts = stats.counts || {};

      document.getElementById('data-stat-total').textContent = (counts.total || 0).toLocaleString();
      document.getElementById('data-stat-draft').textContent = (counts.draft_count || 0).toLocaleString();
      document.getElementById('data-stat-review').textContent = (counts.under_review_count || 0).toLocaleString();
      document.getElementById('data-stat-validated').textContent = (counts.validated_count || 0).toLocaleString();
      document.getElementById('data-stat-published').textContent = (counts.published_count || 0).toLocaleString();
      document.getElementById('data-stat-revoked').textContent = (counts.revoked_count || 0).toLocaleString();

      // Métriques opérationnelles Lot 3E.4
      const elPendingArb = document.getElementById('data-stat-pending-arbitration');
      if (elPendingArb) elPendingArb.textContent = (counts.pending_arbitration_count || 0).toLocaleString();

      const elPendingEv = document.getElementById('data-stat-pending-evidence');
      if (elPendingEv) elPendingEv.textContent = (counts.pending_evidence_count || 0).toLocaleString();

      const elCorrections = document.getElementById('data-stat-corrections');
      if (elCorrections) elCorrections.textContent = (counts.correction_requested_count || 0).toLocaleString();

      const elReadyPub = document.getElementById('data-stat-ready-pub');
      if (elReadyPub) elReadyPub.textContent = (counts.ready_for_publication_count || counts.validated_count || 0).toLocaleString();

      // Barre de réconciliation des données et périmètres (Lot 3I)
      const reconText = document.getElementById('data-reconciliation-text');
      const reconBreakdown = document.getElementById('data-reconciliation-breakdown');
      if (reconText && reconBreakdown) {
        if (State.excludeTests) {
          reconText.innerHTML = `Périmètre d'affichage : <strong>Données réelles uniquement (${(counts.total || 0).toLocaleString()} observations actives)</strong>`;
          reconBreakdown.innerHTML = `
            <span class="recon-pill recon-pill-accent">${(counts.total || 0).toLocaleString()} observations réelles</span>
            <span class="recon-pill">${(counts.draft_count || 0).toLocaleString()} brouillons (incl. 24 pilotes)</span>
            <span class="recon-pill">${(counts.under_review_count || 0).toLocaleString()} en attente</span>
            <span class="recon-pill">${(counts.published_count || 0).toLocaleString()} publiées</span>
          `;
        } else {
          reconText.innerHTML = `Périmètre d'affichage : <strong>Toutes les observations (${(counts.total || 0).toLocaleString()} observations au catalogue complet)</strong>`;
          reconBreakdown.innerHTML = `
            <span class="recon-pill">${(counts.total || 0).toLocaleString()} obs. au catalogue</span>
            <span class="recon-pill recon-pill-accent">370 données réelles certifiées</span>
            <span class="recon-pill">89 archivées ou rejetées</span>
            <span class="recon-pill">1 040 bancs de tests techniques</span>
          `;
        }
      }

      const badgeVal = document.getElementById('badge-validation-count');
      if (badgeVal) {
        badgeVal.textContent = counts.under_review_count || 0;
        badgeVal.style.display = counts.under_review_count > 0 ? 'inline-flex' : 'none';
      }

      // Zone 1.A : Tâches nécessitant une intervention (Lot 3E.4)
      const actionList = document.getElementById('data-action-required-list');
      if (actionList) {
        const tasks = [];
        if (counts.pending_evidence_count > 0) {
          tasks.push({
            icon: 'file-warning',
            color: '#dc2626',
            title: `${counts.pending_evidence_count} observation(s) en attente de preuves documentaires`,
            desc: 'Fichiers PDF originaux certifiés manquants. Rapprochement ou collecte requis.',
            actionLabel: 'Filtrer preuves manquantes',
            actionTab: 'explorer'
          });
        }
        if (counts.correction_requested_count > 0) {
          tasks.push({
            icon: 'undo-2',
            color: '#ea580c',
            title: `${counts.correction_requested_count} observation(s) avec correction méthodologique demandée`,
            desc: 'Anomalies ou compléments en attente de révision.',
            actionLabel: 'Voir corrections',
            actionTab: 'explorer'
          });
        }
        if (counts.under_review_count > 0) {
          tasks.push({
            icon: 'clock',
            color: '#b45309',
            title: `${counts.under_review_count} observation(s) en attente de validation méthodologique`,
            desc: 'Vérification des sources et contrôle qualité requis.',
            actionLabel: 'Traiter la file',
            actionTab: 'validation'
          });
        }
        if (counts.validated_count > 0 && State.currentUser?.role === 'admin') {
          tasks.push({
            icon: 'check-circle-2',
            color: '#15803d',
            title: `${counts.validated_count} observation(s) validée(s) prête(s) pour publication`,
            desc: 'Autorisation finale de diffusion publique par un Administrateur.',
            actionLabel: 'Publier',
            actionFilter: 'methodologically_validated'
          });
        }
        if (counts.draft_count > 0) {
          tasks.push({
            icon: 'file-edit',
            color: '#475569',
            title: `${counts.draft_count} brouillon(s) en cours de saisie`,
            desc: 'Observations non encore soumises à la validation.',
            actionLabel: 'Voir les brouillons',
            actionFilter: 'draft'
          });
        }

        if (tasks.length === 0) {
          actionList.innerHTML = `
            <div class="data-empty-state" style="padding:20px;">
              <i data-lucide="check-circle" style="color:#15803d; width:28px;height:28px;margin-bottom:6px;"></i>
              <div>Aucune tâche urgente. Le socle de données est à jour !</div>
            </div>`;
        } else {
          actionList.innerHTML = tasks.map(t => `
            <div class="data-action-item">
              <div style="display:flex; align-items:center; gap:10px;">
                <i data-lucide="${t.icon}" style="color:${t.color}; width:20px;height:20px; flex-shrink:0;"></i>
                <div class="data-action-info">
                  <div class="data-action-title">${escapeHTML(t.title)}</div>
                  <div class="data-action-meta">${escapeHTML(t.desc)}</div>
                </div>
              </div>
              <button type="button" class="data-btn data-btn-xs data-btn-secondary" onclick="${t.actionTab ? `SolitiquoDataAdmin.switchDataTab('${t.actionTab}')` : `SolitiquoDataAdmin.filterStatus('${t.actionFilter}')`}">
                ${escapeHTML(t.actionLabel)}
              </button>
            </div>
          `).join('');
        }
      }

      // Zone 1.B : Dernières publications actives
      const pubBody = document.getElementById('data-recent-publications-list');
      if (pubBody) {
        const pubs = stats.recentPublications || [];
        if (pubs.length === 0) {
          pubBody.innerHTML = '<tr><td colspan="6" class="data-empty-state">Aucune donnée statistique publiée actuellement.</td></tr>';
        } else {
          pubBody.innerHTML = pubs.map(p => `
            <tr>
              <td>
                <strong>${escapeHTML(p.indicator_name || p.indicator_code)}</strong>
                <div style="font-size:0.75rem; color:#64748b;">${escapeHTML(p.indicator_code)}</div>
              </td>
              <td><span class="data-tag-territory">${escapeHTML(p.territory_code)}</span></td>
              <td>${formatDate(p.period_start)} ➔ ${formatDate(p.period_end)}</td>
              <td><strong>${formatNumber(p.value_numeric)}</strong></td>
              <td>${formatDate(p.published_at)}</td>
              <td style="text-align:right;">
                <button type="button" class="data-btn data-btn-xs data-btn-secondary" onclick="SolitiquoDataAdmin.openDetailView(${p.id})">
                  <i data-lucide="eye"></i> Fiche
                </button>
              </td>
            </tr>
          `).join('');
        }
      }

      // Zone 2 : Activité éditoriale récente (Audit live)
      const activityBody = document.getElementById('data-recent-activity-list');
      if (activityBody) {
        const acts = stats.recentActivity || [];
        if (acts.length === 0) {
          activityBody.innerHTML = '<div class="data-empty-state">Aucune activité enregistrée récemment.</div>';
        } else {
          activityBody.innerHTML = acts.map(a => `
            <div class="data-activity-item">
              <div class="data-activity-dot"></div>
              <div class="data-activity-content">
                <div class="data-activity-header">
                  <strong>${escapeHTML(a.performed_by_username || 'Système')}</strong>
                  a exécuté <code>${escapeHTML(a.action)}</code> sur observation #${a.data_value_id}
                  (${escapeHTML(a.indicator_code || '')})
                </div>
                ${a.old_status && a.new_status ? `
                  <div style="font-size:0.78rem; color:#475569; margin-top:2px;">
                    Transition : ${getStatusBadge(a.old_status)} ➔ ${getStatusBadge(a.new_status)}
                  </div>` : ''}
                ${a.reason ? `<div style="font-size:0.78rem; font-style:italic; color:#64748b; margin-top:2px;">« ${escapeHTML(a.reason)} »</div>` : ''}
                <div class="data-activity-meta">
                  <i data-lucide="clock" style="width:11px;height:11px;"></i> ${formatDate(a.performed_at, true)}
                </div>
              </div>
            </div>
          `).join('');
        }
      }

      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
      loadQualityReport();
    } catch (e) {
      console.error('Erreur chargement dashboard DATA:', e);
    }
  }

    // ---------------------------------------------------------------------------
  // 5.B MODULE DE CONTRÔLE DE QUALITÉ ÉDITORIALE (LOT 3H & 3I)
  // ---------------------------------------------------------------------------
  async function loadQualityReport() {
    const bodyEl = document.getElementById('quality-report-body');
    const scoreValEl = document.getElementById('quality-score-value');
    const statusPillEl = document.getElementById('quality-status-pill');
    const refreshBtn = document.getElementById('btn-refresh-quality');
    const timestampEl = document.getElementById('quality-eval-timestamp');
    const summaryMetaEl = document.getElementById('quality-summary-meta');
    if (!bodyEl) return;

    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.classList.add('loading');
    }

    bodyEl.innerHTML = `
      <div class="quality-loading-state">
        <i data-lucide="loader" class="spin"></i>
        <span>Évaluation continue de la qualité éditoriale et de la sanctuarisation...</span>
      </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    try {
      let res;
      try {
        res = await DataAdminAPI.request('/api/data/admin/quality-report');
      } catch (e1) {
        res = await DataAdminAPI.request('/api/admin/quality-report');
      }

      const json = res && res.data ? res.data : res;
      if (!json || (!json.success && json.quality_score === undefined)) {
        throw new Error((json && json.error) || 'Rapport de qualité indisponible');
      }

      const score = typeof json.quality_score === 'number' ? json.quality_score : 0;
      const status = json.status || (score >= 80 ? 'CONFORME_PRODUCTION' : 'ATTENTION_REQUISE');
      const conformities = json.conformities || [];
      const warnings = json.warnings || [];
      const anomalies = json.anomalies || [];
      const summary = json.summary || {};

      if (scoreValEl) {
        scoreValEl.textContent = score;
      }

      if (statusPillEl) {
        statusPillEl.className = 'quality-status-pill ' + (score >= 80 ? 'status-success' : 'status-warning');
        statusPillEl.textContent = status === 'CONFORME_PRODUCTION' ? 'Conforme Production' : 'Attention Requise';
      }

      const auditedAt = json.audited_at ? new Date(json.audited_at) : new Date();
      if (timestampEl) {
        const dateStr = !isNaN(auditedAt.getTime())
          ? auditedAt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' à ' + auditedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : 'Instantané';
        timestampEl.innerHTML = `<i data-lucide="clock"></i> Évalué le ${dateStr}`;
      }

      if (summaryMetaEl) {
        const parts = [];
        if (summary.public_indicators_count !== undefined) parts.push(`${summary.public_indicators_count} indicateurs`);
        if (summary.published_observations_count !== undefined) parts.push(`${summary.published_observations_count} obs. publiées`);
        if (summary.public_parties_count !== undefined) parts.push(`${summary.public_parties_count} partis`);
        summaryMetaEl.textContent = parts.length > 0 ? `Contrôle sur ${parts.join(' • ')}` : 'Moteur d\'audit Solitiquo DATA v3.1';
      }

      const kpisHtml = `
        <div class="quality-kpi-grid">
          <div class="quality-kpi-card">
            <span class="quality-kpi-label">Score Global</span>
            <span class="quality-kpi-value ${score >= 80 ? 'text-emerald' : 'text-amber'}">${score} / 100</span>
            <span class="quality-kpi-hint">Index de rigueur statistique</span>
          </div>
          <div class="quality-kpi-card">
            <span class="quality-kpi-label">Statut Réglementaire</span>
            <span class="quality-kpi-value text-emerald">${score >= 80 ? 'Conforme' : 'Révision'}</span>
            <span class="quality-kpi-hint">Prêt pour diffusion publique</span>
          </div>
          <div class="quality-kpi-card">
            <span class="quality-kpi-label">Anomalies Critiques</span>
            <span class="quality-kpi-value ${anomalies.length === 0 ? 'text-emerald' : 'text-crimson'}">${anomalies.length}</span>
            <span class="quality-kpi-hint">${anomalies.length === 0 ? 'Zéro blocage décelé' : 'Action immédiate requise'}</span>
          </div>
          <div class="quality-kpi-card">
            <span class="quality-kpi-label">Points de Vigilance</span>
            <span class="quality-kpi-value text-amber">${warnings.length}</span>
            <span class="quality-kpi-hint">${warnings.length > 0 ? 'Entités tests isolées en base' : 'Aucun point d\'attention'}</span>
          </div>
        </div>
      `;

      let conformitiesListHtml = conformities.map(c => `
        <li class="quality-item quality-item-success">
          <i data-lucide="check-circle-2"></i>
          <div class="quality-item-content">
            <div class="quality-item-msg">${escapeHTML(c.message)}</div>
          </div>
        </li>
      `).join('');

      let warningsListHtml = warnings.map(w => `
        <li class="quality-item quality-item-warning">
          <i data-lucide="alert-triangle"></i>
          <div class="quality-item-content">
            <div class="quality-item-msg">${escapeHTML(w.message)}</div>
          </div>
        </li>
      `).join('');

      let anomaliesListHtml = anomalies.map(a => `
        <li class="quality-item quality-item-danger">
          <i data-lucide="alert-octagon"></i>
          <div class="quality-item-content">
            <div class="quality-item-msg">${escapeHTML(a.message)}</div>
          </div>
        </li>
      `).join('');

      const detailsHtml = `
        <div class="quality-details-grid">
          <div class="quality-column quality-column-success">
            <div class="quality-column-header">
              <span class="quality-col-title"><i data-lucide="shield-check"></i> Points de Conformité Validés</span>
              <span class="quality-col-count count-success">${conformities.length}</span>
            </div>
            <ul class="quality-item-list">
              ${conformitiesListHtml || '<li class="quality-empty-notice">Aucun point de conformité validé.</li>'}
            </ul>
          </div>

          <div class="quality-column quality-column-warning">
            <div class="quality-column-header">
              <span class="quality-col-title"><i data-lucide="shield-alert"></i> Points de Vigilance & Isolation</span>
              <span class="quality-col-count count-warning">${warnings.length}</span>
            </div>
            <ul class="quality-item-list">
              ${warningsListHtml || '<li class="quality-empty-notice">Aucun point de vigilance actif.</li>'}
            </ul>
          </div>

          ${anomalies.length > 0 ? `
          <div class="quality-column quality-column-danger" style="grid-column: 1 / -1;">
            <div class="quality-column-header">
              <span class="quality-col-title"><i data-lucide="alert-octagon"></i> Anomalies Critiques Bloquantes</span>
              <span class="quality-col-count count-danger">${anomalies.length}</span>
            </div>
            <ul class="quality-item-list">
              ${anomaliesListHtml}
            </ul>
          </div>
          ` : ''}
        </div>
      `;

      bodyEl.innerHTML = kpisHtml + detailsHtml;
      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
    } catch (err) {
      console.error('Erreur loadQualityReport:', err);
      if (scoreValEl) scoreValEl.textContent = 'Err';
      if (statusPillEl) {
        statusPillEl.className = 'quality-status-pill status-warning';
        statusPillEl.textContent = 'Indisponible';
      }
      bodyEl.innerHTML = `
        <div class="quality-error-state">
          <i data-lucide="wifi-off"></i>
          <div>
            <strong>Erreur de communication avec le moteur d'audit</strong>
            <p>${escapeHTML(err.message || 'Impossible de récupérer le rapport de qualité éditoriale.')}</p>
          </div>
          <button type="button" class="btn btn-sm btn-primary" onclick="SolitiquoDataAdmin.loadQualityReport()">
            <i data-lucide="refresh-cw"></i> Réessayer l'audit
          </button>
        </div>
      `;
      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('loading');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 6. VUE 2 : OBSERVATIONS STATISTIQUES (TABLEAU & FILTRES)
  // ---------------------------------------------------------------------------
  async function loadObservations() {
    const tbody = document.getElementById('data-observations-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="8" class="data-empty-state"><i data-lucide="loader" class="spin"></i> Chargement des observations...</td></tr>';
    if (window.lucide) window.lucide.createIcons();

    try {
      const q = new URLSearchParams();
      q.set('page', State.filters.page);
      q.set('limit', State.filters.limit);
      if (State.filters.editorial_status) q.set('editorial_status', State.filters.editorial_status);
      if (State.filters.indicator_id) q.set('indicator_id', State.filters.indicator_id);
      if (State.filters.territory_id) q.set('territory_id', State.filters.territory_id);
      if (State.filters.search) q.set('q', State.filters.search);
      if (State.excludeTests) q.set('exclude_tests', 'true');

      const res = await DataAdminAPI.getObservations('?' + q.toString());
      let items = res.data || [];
      const meta = res.meta || {};

      State.pagination.total = meta.total || items.length;
      State.pagination.totalPages = meta.totalPages || meta.total_pages || 1;
      State.pagination.currentPage = meta.page || 1;

      // Mise à jour de la pagination UI
      const pageInfo = document.getElementById('data-page-info');
      if (pageInfo) {
        pageInfo.textContent = `Page ${State.pagination.currentPage} sur ${State.pagination.totalPages} (${State.pagination.total} observation${State.pagination.total > 1 ? 's' : ''})`;
      }
      const prevBtn = document.getElementById('data-page-prev');
      const nextBtn = document.getElementById('data-page-next');
      if (prevBtn) prevBtn.disabled = State.pagination.currentPage <= 1;
      if (nextBtn) nextBtn.disabled = State.pagination.currentPage >= State.pagination.totalPages;

      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="data-empty-state">Aucune observation ne correspond aux critères sélectionnés.</td></tr>';
        return;
      }

      const isAdmin = State.currentUser?.role === 'admin';
      const currentUserId = State.currentUser?.id;

      tbody.innerHTML = items.map(obs => {
        const primarySource = (obs.sources || []).find(s => s.source_role === 'primary');
        const isOwner = obs.created_by === currentUserId;
        const canEdit = obs.editorial_status === 'draft' && (isAdmin || isOwner);

        // Actions contextuelles professionnelles
        let actionButtons = `
          <button type="button" class="data-btn data-btn-xs data-btn-secondary" onclick="SolitiquoDataAdmin.openDetailView(${obs.id})" title="Consulter la fiche détaillée">
            <i data-lucide="eye"></i>
          </button>
        `;

        if (canEdit) {
          actionButtons += `
            <button type="button" class="data-btn data-btn-xs data-btn-secondary" onclick="SolitiquoDataAdmin.openEditor(${obs.id})" title="Modifier">
              <i data-lucide="pencil"></i>
            </button>
            <button type="button" class="data-btn data-btn-xs data-btn-primary" onclick="SolitiquoDataAdmin.promptSubmit(${obs.id})" title="Soumettre à validation">
              <i data-lucide="send"></i>
            </button>
          `;
        }

        if (isAdmin) {
          if (obs.editorial_status === 'under_review') {
            actionButtons += `
              <button type="button" class="data-btn data-btn-xs data-btn-success" onclick="SolitiquoDataAdmin.openValidationDossier(${obs.id})" title="Examiner et valider">
                <i data-lucide="check"></i> Valider
              </button>
            `;
          }
          if (obs.editorial_status === 'methodologically_validated') {
            actionButtons += `
              <button type="button" class="data-btn data-btn-xs data-btn-success" onclick="SolitiquoDataAdmin.promptPublish(${obs.id})" title="Publier l'observation">
                <i data-lucide="globe"></i> Publier
              </button>
            `;
          }
          if (obs.editorial_status === 'published') {
            actionButtons += `
              <button type="button" class="data-btn data-btn-xs data-btn-secondary" onclick="SolitiquoDataAdmin.promptRevise(${obs.id})" title="Créer une révision R(n+1)">
                <i data-lucide="git-branch"></i>
              </button>
              <button type="button" class="data-btn data-btn-xs data-btn-danger" onclick="SolitiquoDataAdmin.promptRevoke(${obs.id})" title="Révoquer publiquement">
                <i data-lucide="alert-octagon"></i>
              </button>
            `;
          }
        }

        // Valeur formatée
        let displayVal = '—';
        if (obs.value_numeric !== null && obs.value_numeric !== undefined) {
          displayVal = `<strong>${formatNumber(obs.value_numeric)}</strong> <span style="font-size:0.75rem; color:#64748b;">${escapeHTML(obs.indicator_unit || '')}</span>`;
        } else if (obs.value_text) {
          displayVal = `<span style="font-weight:600;">${escapeHTML(obs.value_text)}</span>`;
        } else if (obs.missing_reason) {
          displayVal = `<span style="color:#b91c1c; font-style:italic;">[${escapeHTML(obs.missing_reason)}]</span>`;
        }

        return `
          <tr>
            <td>
              <span class="data-tag-revision">R${obs.revision_number || 1}</span>
              <strong>${escapeHTML(obs.indicator_name || obs.indicator_code)}</strong>
              <div style="font-size:0.75rem; color:#64748b;">${escapeHTML(obs.indicator_code)}</div>
            </td>
            <td><span class="data-tag-territory">${escapeHTML(obs.territory_code)}</span></td>
            <td>
              <div>${formatDate(obs.period_start)} ➔ ${formatDate(obs.period_end)}</div>
              <div style="font-size:0.72rem; color:#64748b; text-transform:uppercase;">${escapeHTML(obs.methodology_nature || obs.period_type)}</div>
            </td>
            <td>${displayVal}</td>
            <td>${getStatusBadge(obs.editorial_status)}</td>
            <td>
              ${primarySource ? `
                <div style="font-size:0.8rem; font-weight:700; color:#1e293b;">${escapeHTML(primarySource.source_acronym || primarySource.source_name)}</div>
                <div style="font-size:0.72rem; color:#64748b; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHTML(primarySource.citation_reference || '')}">
                  ${escapeHTML(primarySource.citation_reference || 'Réf.')}
                </div>
              ` : '<span style="color:#dc2626; font-size:0.75rem; font-weight:600;"><i data-lucide="alert-circle"></i> Non documentée</span>'}
            </td>
            <td style="font-size:0.8rem; color:#64748b;">${escapeHTML(obs.created_by_username || 'Auteur')}</td>
            <td style="text-align:right; white-space:nowrap;">${actionButtons}</td>
          </tr>
        `;
      }).join('');

      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
    } catch (e) {
      console.error('Erreur chargement observations:', e);
      tbody.innerHTML = `<tr><td colspan="8" class="data-empty-state" style="color:#dc2626;">Erreur : ${escapeHTML(e.message)}</td></tr>`;
    }
  }

  // ---------------------------------------------------------------------------
  // 7. VUE 3 : FORMULAIRE DE SAISIE EN 5 ÉTAPES (PLEINE PAGE / WIZARD)
  // ---------------------------------------------------------------------------
  function populateEditorSelects() {
    const indSelect = document.getElementById('editor-indicator-id');
    if (indSelect) {
      const activeIndicators = State.excludeTests
        ? State.referentials.indicators.filter(i => !i.code.startsWith('IND_') && !i.name.startsWith('Indicateur '))
        : State.referentials.indicators;

      indSelect.innerHTML = '<option value="">Sélectionnez un indicateur...</option>' +
        activeIndicators.map(i => `<option value="${i.id}">${escapeHTML(i.name)} (${escapeHTML(i.code)})</option>`).join('');
    }

    const terSelect = document.getElementById('editor-territory-id');
    if (terSelect) {
      terSelect.innerHTML = '<option value="">Sélectionnez le territoire...</option>' +
        State.referentials.territories.map(t => `<option value="${t.id}">${escapeHTML(t.name)} (${escapeHTML(t.code)})</option>`).join('');
    }

    const srcSelect = document.getElementById('subform-source-id');
    if (srcSelect) {
      srcSelect.innerHTML = '<option value="">Sélectionnez l\'institution...</option>' +
        State.referentials.sources.map(s => `<option value="${s.id}">${escapeHTML(s.name)} (${escapeHTML(s.acronym || '')})</option>`).join('');
    }

    const dimSelect = document.getElementById('subform-dim-id');
    if (dimSelect) {
      dimSelect.innerHTML = '<option value="">Sélectionnez la dimension...</option>' +
        State.referentials.dimensions.map(d => `<option value="${d.id}">${escapeHTML(d.label)} (${escapeHTML(d.code)})</option>`).join('');
    }
  }

  function bindEditorEvents() {
    // Stepper header navigation directe sur clic
    document.querySelectorAll('.data-step').forEach(stepEl => {
      stepEl.addEventListener('click', () => {
        const stepNum = parseInt(stepEl.dataset.step, 10);
        goToStep(stepNum);
      });
    });

    // Étape 1 : indicateur selection change -> mise à jour meta box
    const indSelect = document.getElementById('editor-indicator-id');
    if (indSelect) {
      indSelect.addEventListener('change', () => {
        const indId = parseInt(indSelect.value, 10);
        const ind = State.referentials.indicators.find(i => i.id === indId);
        const metaBox = document.getElementById('editor-indicator-meta');
        const catBadge = document.getElementById('editor-meta-category');
        const unitDisplay = document.getElementById('editor-meta-unit');
        const descDisplay = document.getElementById('editor-meta-desc');
        const unitChip = document.getElementById('editor-unit-chip');

        if (ind) {
          if (metaBox) metaBox.style.display = 'block';
          if (catBadge) catBadge.textContent = ind.category || 'Général';
          if (unitDisplay) unitDisplay.textContent = ind.unit || 'Sans unité';
          if (descDisplay) descDisplay.textContent = ind.description || 'Indicateur officiel.';
          if (unitChip) unitChip.textContent = ind.unit || 'Unité';
        } else {
          if (metaBox) metaBox.style.display = 'none';
          if (unitChip) unitChip.textContent = 'Unité';
        }
      });
    }

    // Étape 3 : saisie numérique en direct -> contrôle de cohérence
    const valInput = document.getElementById('editor-val-numeric');
    if (valInput) {
      valInput.addEventListener('input', checkValueConsistency);
    }

    // Étape 4 : Dimension change -> alimenter les items
    const dimSelect = document.getElementById('subform-dim-id');
    const itemSelect = document.getElementById('subform-item-id');
    if (dimSelect && itemSelect) {
      dimSelect.addEventListener('change', () => {
        const dimId = parseInt(dimSelect.value, 10);
        const dim = State.referentials.dimensions.find(d => d.id === dimId);
        if (dim && dim.items && dim.items.length > 0) {
          itemSelect.disabled = false;
          itemSelect.innerHTML = '<option value="">Sélectionnez la catégorie...</option>' +
            dim.items.map(it => `<option value="${it.id}">${escapeHTML(it.label)} (${escapeHTML(it.code)})</option>`).join('');
        } else {
          itemSelect.disabled = true;
          itemSelect.innerHTML = '<option value="">Aucun item pour cette dimension</option>';
        }
      });
    }

    // Étape 4 : Bouton Ajouter Source
    const btnAddSrc = document.getElementById('btn-add-source');
    if (btnAddSrc) {
      btnAddSrc.addEventListener('click', addSourceToEditor);
    }

    // Étape 4 : Bouton Ajouter Ventilation
    const btnAddBrk = document.getElementById('btn-add-breakdown');
    if (btnAddBrk) {
      btnAddBrk.addEventListener('click', addBreakdownToEditor);
    }

    // Bouton enregistrer en brouillon en haut
    const btnTopDraft = document.getElementById('btn-editor-save-draft-top');
    if (btnTopDraft) {
      btnTopDraft.addEventListener('click', () => saveDraftAction(false));
    }
  }

  function openEditor(observationId = null) {
    State.editor.isEdit = Boolean(observationId);
    State.editor.editId = observationId;
    State.editor.currentStep = 1;

    populateEditorSelects();

    const titleEl = document.getElementById('editor-title');
    const badgeEl = document.getElementById('editor-mode-badge');

    if (observationId) {
      if (titleEl) titleEl.textContent = `Modification de l'Observation #${observationId}`;
      if (badgeEl) badgeEl.innerHTML = `<i data-lucide="edit"></i> Mode Modification (Brouillon)`;
      loadObservationIntoEditor(observationId);
    } else {
      if (titleEl) titleEl.textContent = 'Saisie d\'une Observation Statistique';
      if (badgeEl) badgeEl.innerHTML = `<i data-lucide="plus-circle"></i> Création de brouillon`;

      // Réinitialiser les données
      State.editor.data = {
        indicator_id: '',
        territory_id: '',
        public_reason_summary: '',
        period_type: 'ANNUAL',
        period_start: '2024-01-01',
        period_end: '2024-12-31',
        methodology_nature: 'administrative_record',
        methodology_notes: '',
        internal_notes: '',
        valueType: 'numeric',
        value_numeric: null,
        value_text: '',
        missing_reason: '',
        sources: [],
        breakdowns: []
      };
      fillEditorForm(State.editor.data);
    }

    switchDataTab('editor');
    goToStep(1);
  }

  async function loadObservationIntoEditor(id) {
    try {
      const res = await DataAdminAPI.getObservation(id);
      const obs = res.data;
      if (!obs) return;

      State.editor.data = {
        indicator_id: obs.indicator_id || '',
        territory_id: obs.territory_id || '',
        public_reason_summary: obs.public_reason_summary || '',
        period_type: obs.period_type || 'ANNUAL',
        period_start: obs.period_start ? obs.period_start.split('T')[0] : '',
        period_end: obs.period_end ? obs.period_end.split('T')[0] : '',
        methodology_nature: obs.methodology_nature || 'administrative_record',
        methodology_notes: obs.methodology_notes || '',
        internal_notes: obs.internal_notes || '',
        valueType: obs.missing_reason ? 'missing' : (obs.value_text ? 'text' : 'numeric'),
        value_numeric: obs.value_numeric,
        value_text: obs.value_text || '',
        missing_reason: obs.missing_reason || '',
        sources: (obs.sources || []).map(s => ({ ...s })),
        breakdowns: (obs.breakdowns || []).map(b => ({ ...b }))
      };

      fillEditorForm(State.editor.data);
    } catch (e) {
      console.error('Erreur chargement observation pour édition:', e);
      toast('error', 'Impossible de charger l\'observation pour modification.');
    }
  }

  function fillEditorForm(d) {
    // Étape 1
    const indSelect = document.getElementById('editor-indicator-id');
    const terSelect = document.getElementById('editor-territory-id');
    const reasonInput = document.getElementById('editor-public-reason');

    if (indSelect) indSelect.value = d.indicator_id || '';
    if (terSelect) terSelect.value = d.territory_id || '';
    if (reasonInput) reasonInput.value = d.public_reason_summary || '';
    if (indSelect) indSelect.dispatchEvent(new Event('change'));

    // Étape 2
    const perSelect = document.getElementById('editor-period-type');
    const startInput = document.getElementById('editor-period-start');
    const endInput = document.getElementById('editor-period-end');
    const methodSelect = document.getElementById('editor-methodology-nature');
    const methodNotes = document.getElementById('editor-methodology-notes');
    const internalNotes = document.getElementById('editor-internal-notes');

    if (perSelect) perSelect.value = d.period_type || 'ANNUAL';
    if (startInput) startInput.value = d.period_start || '';
    if (endInput) endInput.value = d.period_end || '';
    if (methodSelect) methodSelect.value = d.methodology_nature || 'administrative_record';
    if (methodNotes) methodNotes.value = d.methodology_notes || '';
    if (internalNotes) internalNotes.value = d.internal_notes || '';

    // Étape 3
    setValueType(d.valueType || 'numeric');
    const valNum = document.getElementById('editor-val-numeric');
    const valTxt = document.getElementById('editor-val-text');
    const valMiss = document.getElementById('editor-missing-reason');

    if (valNum) valNum.value = (d.value_numeric !== null && d.value_numeric !== undefined) ? d.value_numeric : '';
    if (valTxt) valTxt.value = d.value_text || '';
    if (valMiss) valMiss.value = d.missing_reason || '';
    checkValueConsistency();

    // Étape 4
    renderEditorSourcesTable();
    renderEditorBreakdownsTable();
  }

  function readCurrentStepInputs() {
    const d = State.editor.data;

    // Étape 1
    const indSelect = document.getElementById('editor-indicator-id');
    const terSelect = document.getElementById('editor-territory-id');
    const reasonInput = document.getElementById('editor-public-reason');
    if (indSelect) d.indicator_id = indSelect.value ? parseInt(indSelect.value, 10) : '';
    if (terSelect) d.territory_id = terSelect.value ? parseInt(terSelect.value, 10) : '';
    if (reasonInput) d.public_reason_summary = reasonInput.value.trim();

    // Étape 2
    const perSelect = document.getElementById('editor-period-type');
    const startInput = document.getElementById('editor-period-start');
    const endInput = document.getElementById('editor-period-end');
    const methodSelect = document.getElementById('editor-methodology-nature');
    const methodNotes = document.getElementById('editor-methodology-notes');
    const internalNotes = document.getElementById('editor-internal-notes');
    if (perSelect) d.period_type = perSelect.value;
    if (startInput) d.period_start = startInput.value;
    if (endInput) d.period_end = endInput.value;
    if (methodSelect) d.methodology_nature = methodSelect.value;
    if (methodNotes) d.methodology_notes = methodNotes.value.trim();
    if (internalNotes) d.internal_notes = internalNotes.value.trim();

    // Étape 3
    const valNum = document.getElementById('editor-val-numeric');
    const valTxt = document.getElementById('editor-val-text');
    const valMiss = document.getElementById('editor-missing-reason');
    if (d.valueType === 'numeric') {
      const v = valNum?.value?.trim();
      d.value_numeric = (v !== '' && !isNaN(Number(v))) ? Number(v) : null;
      d.value_text = null;
      d.missing_reason = null;
    } else if (d.valueType === 'text') {
      d.value_numeric = null;
      d.value_text = valTxt?.value?.trim() || null;
      d.missing_reason = null;
    } else if (d.valueType === 'missing') {
      d.value_numeric = null;
      d.value_text = null;
      d.missing_reason = valMiss?.value || null;
    }
  }

  function goToStep(step) {
    if (step < 1 || step > 5) return;
    readCurrentStepInputs();
    State.editor.currentStep = step;

    // Mise à jour de l'affichage du stepper
    document.querySelectorAll('.data-step').forEach(s => {
      const sNum = parseInt(s.dataset.step, 10);
      s.classList.toggle('active', sNum === step);
      s.classList.toggle('completed', sNum < step);
    });

    // Affichage du panneau
    document.querySelectorAll('.data-step-content').forEach(p => p.style.display = 'none');
    const activePane = document.getElementById(`step-pane-step` in window ? `step-pane-${step}` : `step-pane-${step}`);
    if (activePane) activePane.style.display = 'block';

    // Boutons de navigation inférieure
    const prevBtn = document.getElementById('btn-editor-prev');
    const nextBtn = document.getElementById('btn-editor-next');
    const submitBtn = document.getElementById('btn-editor-submit');

    if (prevBtn) prevBtn.style.display = step > 1 ? 'inline-flex' : 'none';
    if (nextBtn) nextBtn.style.display = step < 5 ? 'inline-flex' : 'none';
    if (submitBtn) submitBtn.style.display = step === 5 ? 'inline-flex' : 'none';

    if (step === 5) {
      renderStep5Recap();
    }

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  function nextStep() {
    goToStep(State.editor.currentStep + 1);
  }

  function prevStep() {
    goToStep(State.editor.currentStep - 1);
  }

  function setYearPreset(year) {
    const startInput = document.getElementById('editor-period-start');
    const endInput = document.getElementById('editor-period-end');
    if (startInput) startInput.value = `${year}-01-01`;
    if (endInput) endInput.value = `${year}-12-31`;
  }

  function setValueType(type) {
    State.editor.data.valueType = type;
    document.querySelectorAll('.data-val-type-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.vtype === type);
    });

    const pNum = document.getElementById('panel-val-numeric');
    const pTxt = document.getElementById('panel-val-text');
    const pMiss = document.getElementById('panel-val-missing');

    if (pNum) pNum.style.display = type === 'numeric' ? 'block' : 'none';
    if (pTxt) pTxt.style.display = type === 'text' ? 'block' : 'none';
    if (pMiss) pMiss.style.display = type === 'missing' ? 'block' : 'none';

    checkValueConsistency();
  }

  function checkValueConsistency() {
    const valInput = document.getElementById('editor-val-numeric');
    const box = document.getElementById('editor-consistency-box');
    const text = document.getElementById('editor-consistency-text');
    if (!text || !box) return;

    const type = State.editor.data.valueType;
    if (type === 'numeric') {
      const v = valInput?.value?.trim();
      if (v === '' || isNaN(Number(v))) {
        box.style.background = '#fef2f2';
        box.style.borderColor = '#fca5a5';
        text.innerHTML = '<span style="color:#b91c1c; font-weight:600;">Veuillez saisir une valeur numérique valide (zéro ou décimale acceptés).</span>';
      } else {
        const n = Number(v);
        box.style.background = '#f0fdf4';
        box.style.borderColor = '#bbf7d0';
        text.innerHTML = `<span style="color:#15803d; font-weight:600;">Valeur validée : <strong>${n.toLocaleString('fr-FR')}</strong></span>. Le zéro est reconnu comme donnée authentique.`;
      }
    } else if (type === 'text') {
      box.style.background = '#f8fafc';
      box.style.borderColor = '#e2e8f0';
      text.innerHTML = 'Format textuel qualitatif sélectionné.';
    } else {
      box.style.background = '#fffbeb';
      box.style.borderColor = '#fde68a';
      text.innerHTML = 'Motif officiel de donnée manquante sélectionné.';
    }
  }

  // Étape 4 : Gestion des sources
  function addSourceToEditor() {
    const srcSelect = document.getElementById('subform-source-id');
    const roleSelect = document.getElementById('subform-source-role');
    const tierSelect = document.getElementById('subform-doc-tier');
    const robustSelect = document.getElementById('subform-robustness');
    const citInput = document.getElementById('subform-citation');
    const urlInput = document.getElementById('subform-url');

    const srcId = parseInt(srcSelect?.value, 10);
    const cit = citInput?.value?.trim();

    if (!srcId) {
      toast('warning', 'Veuillez sélectionner une institution émettrice.');
      return;
    }
    if (!cit) {
      toast('warning', 'Veuillez renseigner la référence bibliographique du document.');
      return;
    }

    const srcRef = State.referentials.sources.find(s => s.id === srcId);

    const newSource = {
      source_id: srcId,
      source_name: srcRef?.name || 'Source',
      source_acronym: srcRef?.acronym || '',
      source_role: roleSelect?.value || 'primary',
      documentary_tier: tierSelect?.value || null,
      methodological_robustness: robustSelect?.value || null,
      citation_reference: cit,
      citation_url: urlInput?.value?.trim() || null,
      website_url: urlInput?.value?.trim() || null
    };

    State.editor.data.sources.push(newSource);
    citInput.value = '';
    if (urlInput) urlInput.value = '';

    renderEditorSourcesTable();
    toast('success', 'Source documentaire rattachée !');
  }

  function removeEditorSource(index) {
    State.editor.data.sources.splice(index, 1);
    renderEditorSourcesTable();
  }

  function renderEditorSourcesTable() {
    const tbody = document.getElementById('editor-sources-tbody');
    if (!tbody) return;

    const sources = State.editor.data.sources || [];
    if (sources.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="data-empty-state">Aucune source rattachée. Au moins 1 source principale est requise.</td></tr>';
      return;
    }

    tbody.innerHTML = sources.map((s, idx) => `
      <tr>
        <td><strong>${escapeHTML(s.source_acronym || s.source_name)}</strong></td>
        <td>
          <span style="font-weight:700; color:#37463D;">${escapeHTML(s.source_role)}</span>
          <div style="font-size:0.7rem; color:#64748b;">${escapeHTML(s.documentary_tier)}</div>
        </td>
        <td><div style="max-width:180px; overflow:hidden; text-overflow:ellipsis; font-size:0.8rem;" title="${escapeHTML(s.citation_reference)}">${escapeHTML(s.citation_reference)}</div></td>
        <td style="text-align:right;">
          <button type="button" class="data-btn data-btn-xs data-btn-danger" onclick="SolitiquoDataAdmin.removeEditorSource(${idx})">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      </tr>
    `).join('');

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  // Étape 4 : Gestion des ventilations
  function addBreakdownToEditor() {
    const dimSelect = document.getElementById('subform-dim-id');
    const itemSelect = document.getElementById('subform-item-id');
    const valInput = document.getElementById('subform-breakdown-val');
    const pctInput = document.getElementById('subform-breakdown-pct');
    const rankInput = document.getElementById('subform-breakdown-rank');

    const dimId = parseInt(dimSelect?.value, 10);
    const itemId = parseInt(itemSelect?.value, 10);

    if (!dimId || !itemId) {
      toast('warning', 'Veuillez sélectionner une dimension et une catégorie.');
      return;
    }

    const dim = State.referentials.dimensions.find(d => d.id === dimId);
    const item = dim?.items?.find(i => i.id === itemId);

    const newBreakdown = {
      dimension_id: dimId,
      dimension_label: dim?.label || 'Dimension',
      breakdown_item_id: itemId,
      item_label: item?.label || 'Item',
      value_numeric: valInput?.value ? Number(valInput.value) : null,
      percentage: pctInput?.value ? Number(pctInput.value) : null,
      rank: rankInput?.value ? parseInt(rankInput.value, 10) : null
    };

    State.editor.data.breakdowns.push(newBreakdown);
    if (valInput) valInput.value = '';
    if (pctInput) pctInput.value = '';
    if (rankInput) rankInput.value = '';

    renderEditorBreakdownsTable();
    toast('success', 'Ventilation statistique ajoutée !');
  }

  function removeEditorBreakdown(index) {
    State.editor.data.breakdowns.splice(index, 1);
    renderEditorBreakdownsTable();
  }

  function renderEditorBreakdownsTable() {
    const tbody = document.getElementById('editor-breakdowns-tbody');
    if (!tbody) return;

    const brks = State.editor.data.breakdowns || [];
    if (brks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="data-empty-state">Aucune ventilation statistique associée.</td></tr>';
      return;
    }

    tbody.innerHTML = brks.map((b, idx) => `
      <tr>
        <td><strong>${escapeHTML(b.dimension_label || '')}</strong></td>
        <td>${escapeHTML(b.item_label || '')}</td>
        <td>${b.value_numeric !== null ? formatNumber(b.value_numeric) : '—'}</td>
        <td>${b.percentage !== null ? b.percentage + '%' : '—'}</td>
        <td style="text-align:right;">
          <button type="button" class="data-btn data-btn-xs data-btn-danger" onclick="SolitiquoDataAdmin.removeEditorBreakdown(${idx})">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      </tr>
    `).join('');

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  // Étape 5 : Récapitulatif et validation
  function renderStep5Recap() {
    readCurrentStepInputs();
    const d = State.editor.data;

    const ind = State.referentials.indicators.find(i => i.id === d.indicator_id);
    const ter = State.referentials.territories.find(t => t.id === d.territory_id);

    // Fiche Récap
    document.getElementById('recap-indicator').textContent = ind ? `${ind.name} (${ind.code})` : 'Non sélectionné';
    document.getElementById('recap-territory').textContent = ter ? `${ter.name} (${ter.code})` : 'Non sélectionné';
    document.getElementById('recap-period').textContent = `${formatDate(d.period_start)} ➔ ${formatDate(d.period_end)} [${d.period_type}]`;
    document.getElementById('recap-methodology').textContent = d.methodology_nature;

    let valDisplay = '—';
    if (d.valueType === 'numeric' && d.value_numeric !== null) {
      valDisplay = `${formatNumber(d.value_numeric)} ${ind?.unit || ''}`;
    } else if (d.valueType === 'text' && d.value_text) {
      valDisplay = d.value_text;
    } else if (d.valueType === 'missing' && d.missing_reason) {
      valDisplay = `[${d.missing_reason}]`;
    }
    document.getElementById('recap-value').textContent = valDisplay;
    document.getElementById('recap-sources-count').textContent = `${d.sources.length} source(s)`;
    document.getElementById('recap-breakdowns-count').textContent = `${d.breakdowns.length} ventilation(s)`;

    // Checklist de contrôle
    const hasIndTer = Boolean(d.indicator_id && d.territory_id);
    const hasPeriod = Boolean(d.period_start && d.period_end && d.period_start <= d.period_end);
    const hasMethod = Boolean(d.methodology_nature);
    const hasVal = Boolean(
      (d.valueType === 'numeric' && d.value_numeric !== null) ||
      (d.valueType === 'text' && d.value_text) ||
      (d.valueType === 'missing' && d.missing_reason)
    );
    const hasPrimarySource = d.sources.some(s => s.source_role === 'primary');

    updateCheckItem('check-item-ind', hasIndTer);
    updateCheckItem('check-item-period', hasPeriod);
    updateCheckItem('check-item-method', hasMethod);
    updateCheckItem('check-item-val', hasVal);
    updateCheckItem('check-item-source', hasPrimarySource);

    const allValid = hasIndTer && hasPeriod && hasMethod && hasVal && hasPrimarySource;
    const warnBox = document.getElementById('checklist-warning');
    const submitBtn = document.getElementById('btn-editor-submit');

    if (warnBox) warnBox.style.display = allValid ? 'none' : 'flex';
    if (submitBtn) submitBtn.disabled = !allValid;

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  function updateCheckItem(id, valid) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = valid ? 'valid' : 'invalid';
    const icon = el.querySelector('i');
    if (icon) {
      icon.setAttribute('data-lucide', valid ? 'check-circle-2' : 'alert-circle');
    }
  }

  // Enregistrement Brouillon ou Soumission à validation
  async function saveDraftAction(submitForReview = false) {
    readCurrentStepInputs();
    const d = State.editor.data;

    if (!d.indicator_id || !d.territory_id) {
      toast('warning', 'Veuillez sélectionner un indicateur et un territoire (Étape 1).');
      goToStep(1);
      return;
    }
    if (!d.period_start || !d.period_end) {
      toast('warning', 'Veuillez spécifier les dates de début et de fin de période (Étape 2).');
      goToStep(2);
      return;
    }

    const hasVal = Boolean(
      (d.valueType === 'numeric' && d.value_numeric !== null) ||
      (d.valueType === 'text' && d.value_text) ||
      (d.valueType === 'missing' && d.missing_reason)
    );
    if (!hasVal) {
      toast('warning', 'Veuillez spécifier une valeur statistique valide (Étape 3).');
      goToStep(3);
      return;
    }

    if (submitForReview && !d.sources.some(s => s.source_role === 'primary')) {
      toast('warning', 'Au moins une source principale est requise pour soumettre à validation (Étape 4).');
      goToStep(4);
      return;
    }

    const payload = {
      indicator_id: d.indicator_id,
      territory_id: d.territory_id,
      period_type: d.period_type,
      period_start: d.period_start,
      period_end: d.period_end,
      value_numeric: d.value_numeric,
      value_text: d.value_text,
      missing_reason: d.missing_reason,
      methodology_nature: d.methodology_nature,
      methodology_notes: d.methodology_notes,
      internal_notes: d.internal_notes,
      public_reason_summary: d.public_reason_summary,
      sources: d.sources,
      breakdowns: d.breakdowns
    };

    // Protection anti-double-clic
    const btnSubmit = document.getElementById('btn-editor-submit');
    const btnDraft = document.getElementById('btn-editor-save-draft');
    if (btnSubmit) btnSubmit.disabled = true;
    if (btnDraft) btnDraft.disabled = true;

    try {
      let savedObs;
      if (State.editor.isEdit && State.editor.editId) {
        const updateRes = await DataAdminAPI.updateDraft(State.editor.editId, payload);
        savedObs = updateRes.data;
      } else {
        const createRes = await DataAdminAPI.createDraft(payload);
        savedObs = createRes.data;
      }

      if (submitForReview && savedObs && savedObs.id) {
        await DataAdminAPI.submitForReview(savedObs.id);
        toast('success', 'Observation soumise avec succès à la file de validation !');
      } else {
        toast('success', 'Brouillon enregistré avec succès !');
      }

      switchDataTab('observations');
      loadObservations();
      loadDashboard();
    } catch (e) {
      console.error('Erreur enregistrement observation:', e);
      if (window.Swal) {
        window.Swal.fire('Erreur d\'enregistrement', e.message || 'Impossible d\'enregistrer l\'observation.', 'error');
      } else {
        alert(e.message || 'Erreur d\'enregistrement');
      }
    } finally {
      if (btnSubmit) btnSubmit.disabled = false;
      if (btnDraft) btnDraft.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // 8. VUE 4 : FILE DE VALIDATION MÉTHODOLOGIQUE & DOSSIER D'INSPECTION (LOT 3C.2)
  // ---------------------------------------------------------------------------
  function getNatureLabel(nature) {
    switch (nature) {
      case 'projection': return 'Projection démographique';
      case 'administrative_record': return 'Registre administratif / Comptes';
      case 'sample_survey': return 'Enquête statistique par sondage';
      case 'estimation': return 'Estimation statistique';
      default: return nature || 'Observation standard';
    }
  }

  function getAccountStatusClass(status) {
    if (!status) return 'other';
    const s = status.toLowerCase();
    if (s.includes('semi-définitif')) return 'semidef';
    if (s.includes('définitif')) return 'def';
    return 'other';
  }

  function renderSeriesVisualizer(currentObs, seriesItems) {
    if (!seriesItems || seriesItems.length === 0) seriesItems = [currentObs];
    // Trier chronologiquement
    const sorted = [...seriesItems].sort((a, b) => new Date(a.period_start) - new Date(b.period_start));
    const code = currentObs.indicator_code;
    const isUnemployment = code === 'LAB_UNEMP_RATE';
    const isPopulation = code === 'POP_TOT_COUNT';
    const isEdu = code === 'EDU_PRIM_GROSS';
    const isGdp = code === 'ECO_PIB_NOM' || code === 'ECO_PIB_GROWTH';

    const width = 660;
    const height = 240;
    const padding = { top: 35, right: 40, bottom: 45, left: 65 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const values = sorted.map(d => parseFloat(d.value_numeric));
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);
    if (isEdu) {
      minVal = Math.min(minVal, 95);
      maxVal = Math.max(maxVal, 112);
    } else {
      minVal = Math.min(minVal * 0.9, minVal);
      maxVal = maxVal * 1.1;
      if (minVal > 0 && !isEdu) minVal = 0;
    }

    const valRange = (maxVal - minVal) || 1;
    const getY = (val) => padding.top + chartH - ((val - minVal) / valRange) * chartH;
    const getX = (idx) => padding.left + (sorted.length > 1 ? (idx / (sorted.length - 1)) * chartW : chartW / 2);

    const points = sorted.map((d, i) => {
      const yr = new Date(d.period_start).getFullYear();
      const yrLabel = isEdu && d.school_year ? d.school_year : yr;
      return {
        ...d,
        cx: getX(i),
        cy: getY(parseFloat(d.value_numeric)),
        val: parseFloat(d.value_numeric),
        yearLabel: yrLabel,
        isCurrent: d.id === currentObs.id,
        isSemiDef: (d.survey_or_account_status || '').toLowerCase().includes('semi-définitif') || yr === 2022
      };
    });

    let svgContent = '';

    // Grilles horizontales
    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const gVal = minVal + (valRange * i) / gridSteps;
      const gy = getY(gVal);
      svgContent += `
        <line x1="${padding.left}" y1="${gy}" x2="${width - padding.right}" y2="${gy}" stroke="#e2e8f0" stroke-dasharray="3,3" />
        <text x="${padding.left - 8}" y="${gy + 4}" font-size="10" fill="#94a3b8" text-anchor="end">${formatNumber(Math.round(gVal * 10) / 10)}</text>
      `;
    }

    // Seuil de référence à 100% pour la scolarisation primaire
    if (isEdu) {
      const y100 = getY(100);
      svgContent += `
        <line x1="${padding.left}" y1="${y100}" x2="${width - padding.right}" y2="${y100}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="4,2" />
        <text x="${width - padding.right + 4}" y="${y100 + 3}" font-size="10" font-weight="700" fill="#dc2626">Seuil 100%</text>
      `;
    }

    // Tracé de courbe : STRICTEMENT INTERDIT pour le chômage (rupture méthodologique)
    if (!isUnemployment && points.length > 1) {
      const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx} ${p.cy}`).join(' ');
      const strokeStyle = isPopulation ? 'stroke-dasharray="4,4"' : '';
      const strokeColor = isPopulation ? '#3b82f6' : '#15803d';
      svgContent += `<path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="2.5" ${strokeStyle} />`;
    }

    // Rendu des points discrets et étiquettes
    points.forEach((p) => {
      const isSelected = p.isCurrent;
      const pointColor = isUnemployment ? '#7c3aed' : (isPopulation ? '#2563eb' : (p.isSemiDef ? '#ea580c' : '#15803d'));
      const pointRadius = isSelected ? 8 : 5.5;

      // Axe X
      svgContent += `
        <text x="${p.cx}" y="${height - padding.bottom + 18}" font-size="11" font-weight="${isSelected ? '700' : '500'}" fill="${isSelected ? '#0f172a' : '#64748b'}" text-anchor="middle">
          ${p.yearLabel}
        </text>
      `;

      // Valeur au-dessus du point
      svgContent += `
        <text x="${p.cx}" y="${p.cy - 12}" font-size="11" font-weight="700" fill="${pointColor}" text-anchor="middle">
          ${formatNumber(p.val)} ${isUnemployment || isEdu || code === 'ECO_PIB_GROWTH' ? '%' : ''}
        </text>
      `;

      if (isPopulation) {
        // Marqueur projection : carré en pointillé
        svgContent += `
          <rect x="${p.cx - 6}" y="${p.cy - 6}" width="12" height="12" fill="#eff6ff" stroke="${pointColor}" stroke-width="${isSelected ? 3 : 2}" stroke-dasharray="2,2" />
          <circle cx="${p.cx}" cy="${p.cy}" r="2" fill="${pointColor}" />
        `;
      } else {
        svgContent += `
          <circle cx="${p.cx}" cy="${p.cy}" r="${pointRadius}" fill="${isSelected ? '#ffffff' : pointColor}" stroke="${pointColor}" stroke-width="${isSelected ? 3 : 2}" />
          ${isSelected ? `<circle cx="${p.cx}" cy="${p.cy}" r="3.5" fill="${pointColor}" />` : ''}
        `;
      }

      // Étiquette d'enquête pour le chômage
      if (isUnemployment) {
        let surveyLabel = 'EESI 2 (15+)';
        if (p.yearLabel == 2014) surveyLabel = 'ECAM 4 (15-64)';
        if (p.yearLabel == 2021) surveyLabel = 'ECAM 5 (15-64)';
        svgContent += `
          <text x="${p.cx}" y="${height - padding.bottom + 34}" font-size="9" font-weight="600" fill="#7c3aed" text-anchor="middle">
            ${surveyLabel}
          </text>
        `;
      }

      // Marqueur semi-définitif pour le PIB 2022
      if (p.isSemiDef && isGdp) {
        svgContent += `
          <text x="${p.cx}" y="${p.cy - 26}" font-size="9" font-weight="700" fill="#ea580c" text-anchor="middle">
            Semi-définitif
          </text>
        `;
      }
    });

    let bannerHtml = '';
    if (isUnemployment) {
      bannerHtml = `
        <div class="data-chart-discontinuous-banner">
          <i data-lucide="alert-triangle" style="width:18px; height:18px; flex-shrink:0;"></i>
          <span><strong>RUPTURE MÉTHODOLOGIQUE — SÉRIE DISCONTINUE (NON INTERPOLABLE) :</strong> Les enquêtes EESI 2 (2010), ECAM 4 (2014) et ECAM 5 (2021) sont des opérations d'échantillonnage indépendantes avec des instruments et des champs d'âge distincts. Tout tracé de courbe continue entre ces trois points est formellement interdit.</span>
        </div>
      `;
    } else if (isPopulation) {
      bannerHtml = `
        <div style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; border-radius:6px; padding:10px 14px; font-size:0.83rem; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
          <i data-lucide="compass" style="width:16px;height:16px;flex-shrink:0;"></i>
          <span><strong>PROJECTION DÉMOGRAPHIQUE OFFICIELLE :</strong> Série extrapolée à partir du RGPH-3 de 2005 (BUCREP, horizon 2035). Marqueurs carrés pointillés pour distinguer visuellement la projection d'un recensement exhaustif direct.</span>
        </div>
      `;
    }

    return `
      <div class="data-visualizer-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <h5 style="margin:0; font-size:0.95rem; font-weight:700; color:#0f172a;">Visualisation de la série temporelle (${sorted.length} observations)</h5>
            <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">
              Unité : <strong>${escapeHTML(currentObs.indicator_unit || '')}</strong> | Territoire : <strong>${escapeHTML(currentObs.territory_name)} (${escapeHTML(currentObs.territory_code)})</strong>
            </div>
          </div>
          <span style="font-size:0.75rem; color:#64748b; background:#f1f5f9; padding:3px 8px; border-radius:4px;">Observation #${currentObs.id} mise en valeur</span>
        </div>
        ${bannerHtml}
        <div style="overflow-x:auto;">
          <svg viewBox="0 0 ${width} ${height}" style="width:100%; max-width:${width}px; height:auto; display:block; margin:0 auto;">
            ${svgContent}
          </svg>
        </div>
      </div>
    `;
  }

  async function loadValidationQueue() {
    const listEl = document.getElementById('data-validation-queue-list');
    const countEl = document.getElementById('val-queue-count');
    if (!listEl) return;

    listEl.innerHTML = '<div class="data-empty-state"><i data-lucide="loader" class="spin"></i> Chargement de la file...</div>';
    if (window.lucide) window.lucide.createIcons();

    try {
      const q = new URLSearchParams();
      const filter = State.validationFilter || 'pilot';

      if (filter === 'wave1') {
        q.set('wave', 'wave1');
        q.set('limit', '100');
      } else if (filter === 'pilot') {
        q.set('pilot_only', 'true');
        q.set('limit', '100');
      } else if (filter === 'draft') {
        q.set('editorial_status', 'draft');
        q.set('limit', '100');
      } else if (filter === 'under_review') {
        q.set('editorial_status', 'under_review');
        q.set('limit', '100');
      } else if (filter === 'methodologically_validated') {
        q.set('editorial_status', 'methodologically_validated');
        q.set('limit', '100');
      } else {
        q.set('limit', '100');
      }

      if (State.excludeTests) q.set('exclude_tests', 'true');

      const res = await DataAdminAPI.getObservations('?' + q.toString());
      let items = res.data || [];

      // Si filtre vague 1 ou pilote, trier par code d'indicateur puis par date
      if (filter === 'wave1' || filter === 'pilot') {
        items.sort((a, b) => {
          if (a.indicator_code !== b.indicator_code) {
            return a.indicator_code.localeCompare(b.indicator_code);
          }
          return new Date(a.period_start) - new Date(b.period_start);
        });
      }

      State.validationQueueCache = items;
      renderValidationQueueItems(items);
    } catch (e) {
      console.error('Erreur chargement validation queue:', e);
      listEl.innerHTML = `<div class="data-empty-state" style="color:#dc2626;">Erreur : ${escapeHTML(e.message)}</div>`;
    }
  }

  function renderValidationQueueItems(items) {
    const listEl = document.getElementById('data-validation-queue-list');
    const countEl = document.getElementById('val-queue-count');
    if (!listEl) return;

    if (countEl) countEl.textContent = items.length;

    if (items.length === 0) {
      listEl.innerHTML = '<div class="data-empty-state" style="padding:40px 10px;">Aucune observation correspondant au filtre sélectionné.</div>';
      const emptyEl = document.getElementById('data-validation-empty');
      const dossierEl = document.getElementById('data-validation-dossier');
      if (emptyEl) emptyEl.style.display = 'block';
      if (dossierEl) dossierEl.style.display = 'none';
      return;
    }

    listEl.innerHTML = items.map(obs => {
      const yr = new Date(obs.period_start).getFullYear();
      const periodLabel = obs.school_year ? `Année scolaire ${obs.school_year}` : yr;
      const isPilot = parseInt(obs.id, 10) >= 687 && parseInt(obs.id, 10) <= 710;

      let auditTag = '';
      if (obs.audit_status === 'confirmed') {
        auditTag = '<span class="data-tag-confirmed" title="Contrôle technique automatisé d\'ingestion (schéma et syntaxe conformes)">✓ Contrôle tech. OK</span>';
      } else if (obs.audit_status === 'confirmed_with_caveat') {
        auditTag = '<span class="data-tag-caveat" title="Contrôle technique avec réserve méthodologique">⚠️ Contrôle tech. (Réserve)</span>';
      }

      let decisionTag = '';
      if (obs.audit_decision === 'accepted') {
        decisionTag = '<span style="font-size:0.68rem; font-weight:700; color:#059669;">[Arbitrage Validé]</span>';
      } else if (obs.audit_decision === 'rejected') {
        decisionTag = '<span style="font-size:0.68rem; font-weight:700; color:#dc2626;">[Arbitrage Refusé]</span>';
      } else if (obs.audit_decision === 'correction_requested') {
        decisionTag = '<span style="font-size:0.68rem; font-weight:700; color:#d97706;">[Correction Demandée]</span>';
      } else if (obs.audit_decision === 'pending_evidence') {
        decisionTag = '<span style="font-size:0.68rem; font-weight:700; color:#475569;">[Preuve en Attente]</span>';
      } else {
        decisionTag = '<span style="font-size:0.68rem; font-weight:700; color:#94a3b8;">[Arbitrage En Attente]</span>';
      }

      return `
        <div class="data-val-queue-item ${obs.id === State.selectedValidationId ? 'active' : ''}" onclick="SolitiquoDataAdmin.selectValidationObservation(${obs.id})">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4px;">
            <div class="data-val-queue-title">${escapeHTML(obs.indicator_name || obs.indicator_code)}</div>
            ${isPilot ? '<span style="font-size:0.68rem; font-weight:800; color:#b45309; background:#fef3c7; padding:1px 5px; border-radius:4px;">#${obs.id}</span>' : ''}
          </div>
          <div class="data-val-queue-meta" style="margin-top:2px;">
            <span><strong style="color:#37463D;">${escapeHTML(obs.territory_code)}</strong> — ${periodLabel}</span>
            <span style="font-weight:700; color:#0f172a;">${obs.value_numeric !== null ? formatNumber(obs.value_numeric) : '—'} ${escapeHTML(obs.indicator_unit || '')}</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
            <div style="display:flex; gap:6px; align-items:center;">
              ${auditTag}
              ${decisionTag}
            </div>
            ${getStatusBadge(obs.editorial_status)}
          </div>
        </div>
      `;
    }).join('');

    // Sélectionner automatiquement le premier élément si aucun n'est actif
    const itemIds = items.map(x => x.id);
    if (!State.selectedValidationId || !itemIds.includes(State.selectedValidationId)) {
      selectValidationObservation(items[0].id);
    } else {
      selectValidationObservation(State.selectedValidationId);
    }

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  function setValidationFilter(filter) {
    State.validationFilter = filter;
    document.querySelectorAll('#val-filter-chips .data-val-chip').forEach(btn => {
      if (btn.getAttribute('data-filter') === filter) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    loadValidationQueue();
  }

  function filterValidationQueue(term) {
    State.validationSearch = term.toLowerCase().trim();
    if (!State.validationQueueCache) return;

    if (!State.validationSearch) {
      renderValidationQueueItems(State.validationQueueCache);
      return;
    }

    const filtered = State.validationQueueCache.filter(obs => {
      const name = (obs.indicator_name || '').toLowerCase();
      const code = (obs.indicator_code || '').toLowerCase();
      const terr = (obs.territory_code || '').toLowerCase();
      const status = (obs.editorial_status || '').toLowerCase();
      const audit = (obs.audit_status || '').toLowerCase();
      return name.includes(State.validationSearch) ||
             code.includes(State.validationSearch) ||
             terr.includes(State.validationSearch) ||
             status.includes(State.validationSearch) ||
             audit.includes(State.validationSearch);
    });

    renderValidationQueueItems(filtered);
  }

  async function selectValidationObservation(id) {
    State.selectedValidationId = id;

    // Mise à jour de la classe active dans la liste
    document.querySelectorAll('.data-val-queue-item').forEach(el => el.classList.remove('active'));

    const emptyBox = document.getElementById('data-validation-empty');
    const dossierBox = document.getElementById('data-validation-dossier');
    if (emptyBox) emptyBox.style.display = 'none';
    if (dossierBox) {
      dossierBox.style.display = 'block';
      dossierBox.innerHTML = '<div class="data-empty-state"><i data-lucide="loader" class="spin"></i> Chargement complet du dossier d\'inspection...</div>';
    }

    try {
      // Chargement en parallèle : observation détaillée, historique des décisions, observations de la même série
      const [resObs, resHistory] = await Promise.all([
        DataAdminAPI.getObservation(id),
        DataAdminAPI.getObservationHistory(id).catch(() => ({ data: { versions: [], audit_log: [] } }))
      ]);

      const obs = resObs.data;
      if (!obs || !dossierBox) return;

      const historyData = resHistory.data || {};
      const auditLog = historyData.audit_log || [];

      // Chargement des points de la même série pour le visualiseur
      let seriesItems = [];
      try {
        const seriesRes = await DataAdminAPI.getObservations(`?indicator_id=${obs.indicator_id}&pilot_only=true&limit=50`);
        seriesItems = seriesRes.data || [];
      } catch (e) {
        seriesItems = [obs];
      }

      const isAdmin = State.currentUser?.role === 'admin';
      const isPilot = parseInt(obs.id, 10) >= 687 && parseInt(obs.id, 10) <= 710;

      // 1. Audit technique badge (contrôle automatisé d'ingestion)
      let auditStatusBadge = '';
      if (obs.audit_status === 'confirmed') {
        auditStatusBadge = '<span class="data-badge-audit confirmed" title="Contrôle technique automatisé d\'ingestion (schéma et syntaxe)"><i data-lucide="cpu"></i> Contrôle technique : Conforme</span>';
      } else if (obs.audit_status === 'confirmed_with_caveat') {
        auditStatusBadge = '<span class="data-badge-audit caveat" title="Contrôle technique avec réserve méthodologique"><i data-lucide="alert-triangle"></i> Contrôle technique : Conforme avec réserve</span>';
      } else {
        auditStatusBadge = '<span class="data-badge-audit" style="background:#f1f5f9; color:#475569;"><i data-lucide="help-circle"></i> Contrôle technique : Non vérifié</span>';
      }

      // 2. Audit decision badge (décision humaine d'arbitrage)
      let auditDecisionBadge = '';
      if (obs.audit_decision === 'accepted') {
        auditDecisionBadge = `<span class="data-badge-audit-decision accepted"><i data-lucide="check-check"></i> Décision Humaine : Accepté par ${escapeHTML(obs.audit_decision_by_username || 'Admin')}</span>`;
      } else if (obs.audit_decision === 'rejected') {
        auditDecisionBadge = `<span class="data-badge-audit-decision rejected"><i data-lucide="x-circle"></i> Décision Humaine : Rejeté / Contesté</span>`;
      } else if (obs.audit_decision === 'correction_requested') {
        auditDecisionBadge = `<span class="data-badge-audit-decision" style="background:#fef3c7; color:#92400e; border:1px solid #fde68a;"><i data-lucide="undo-2"></i> Décision Humaine : Correction Demandée</span>`;
      } else if (obs.audit_decision === 'pending_evidence') {
        auditDecisionBadge = `<span class="data-badge-audit-decision" style="background:#e0f2fe; color:#075985; border:1px solid #bae6fd;"><i data-lucide="help-circle"></i> Décision Humaine : Preuve en Attente</span>`;
      } else {
        auditDecisionBadge = `<span class="data-badge-audit-decision pending"><i data-lucide="clock"></i> Décision Humaine : En Attente d'Arbitrage</span>`;
      }

      // 3. Spécificités méthodologiques par série
      let methodologyAlertHtml = '';
      if (obs.indicator_code === 'POP_TOT_COUNT') {
        methodologyAlertHtml = `
          <div class="data-methodology-card info">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <i data-lucide="compass" style="color:#2563eb; width:20px; height:20px;"></i>
              <strong style="color:#1e40af; font-size:0.95rem;">Règle Méthodologique : Projection Démographique (BUCREP)</strong>
            </div>
            <p style="margin:0 0 6px; font-size:0.86rem; color:#1e3a8a; line-height:1.5;">
              • <strong>Nature de la donnée :</strong> Cette observation constitue explicitement une <em>« Projection démographique »</em> issue du modèle tendanciel national actualisé post-RGPH 3 (horizon 2035).<br>
              • <strong>Base de référence :</strong> Recensement Général de la Population et de l'Habitat (RGPH-3 de 2005).<br>
              • <strong>Réserves formelles :</strong> Chiffre soumis aux arrondis statistiques et à une révision formelle obligatoire lors de la publication des résultats définitifs du 4ème Recensement (RGPH-4).
            </p>
          </div>
        `;
      } else if (obs.indicator_code === 'ECO_PIB_NOM') {
        const isSemi = (obs.survey_or_account_status || '').toLowerCase().includes('semi-définitif');
        methodologyAlertHtml = `
          <div class="data-methodology-card ${isSemi ? 'warning' : 'info'}">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <i data-lucide="landmark" style="color:${isSemi ? '#b45309' : '#15803d'}; width:20px; height:20px;"></i>
              <strong style="color:${isSemi ? '#92400e' : '#166534'}; font-size:0.95rem;">Règle Méthodologique : Comptabilité Nationale (PIB Nominal)</strong>
            </div>
            <p style="margin:0 0 6px; font-size:0.86rem; color:#334155; line-height:1.5;">
              • <strong>Unité &amp; Prix :</strong> Valeur exprimée en <strong>Milliards de FCFA aux prix courants</strong> (Système de Comptabilité Nationale SCN 2008, base 2016).<br>
              • <strong>Statut des comptes :</strong> ${isSemi 
                ? '<span class="data-statut-comptes semidef">Comptes semi-définitifs</span> — Chiffre 2022 provisoire consolidé, sujet à calage définitif ultérieur lors de la clôture des comptes 2023.' 
                : '<span class="data-statut-comptes def">Comptes définitifs</span> — Chiffre consolidé et audité par l\'INS Cameroun.'}
            </p>
          </div>
        `;
      } else if (obs.indicator_code === 'ECO_PIB_GROWTH') {
        const isSemi = (obs.survey_or_account_status || '').toLowerCase().includes('semi-définitif');
        methodologyAlertHtml = `
          <div class="data-methodology-card ${isSemi ? 'warning' : 'info'}">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <i data-lucide="trending-up" style="color:${isSemi ? '#b45309' : '#15803d'}; width:20px; height:20px;"></i>
              <strong style="color:${isSemi ? '#92400e' : '#166534'}; font-size:0.95rem;">Règle Méthodologique : Taux de croissance réel en volume</strong>
            </div>
            <p style="margin:0 0 6px; font-size:0.86rem; color:#334155; line-height:1.5;">
              • <strong>Nature &amp; Cadre :</strong> Taux annuel de croissance économique exprimé en <strong>volume réel</strong>, calculé aux prix de l'année précédente chaînés selon le <strong>SCN 2008 (année de base 2016)</strong>.<br>
              • <strong>Statut des comptes :</strong> ${isSemi 
                ? '<span class="data-statut-comptes semidef">Résultat semi-définitif 2022</span> — Susceptible d\'ajustement lors de l\'établissement des comptes nationaux définitifs.' 
                : '<span class="data-statut-comptes def">Comptes définitifs</span> — Série définitive en volume.'}
            </p>
          </div>
        `;
      } else if (obs.indicator_code === 'LAB_UNEMP_RATE') {
        methodologyAlertHtml = `
          <div class="data-methodology-card rupture">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
              <i data-lucide="alert-octagon" style="color:#dc2626; width:22px; height:22px;"></i>
              <strong style="color:#991b1b; font-size:0.98rem;">RUPTURE MÉTHODOLOGIQUE MAJEURE — SÉRIE STATISTIQUE NON INTERPOLABLE</strong>
            </div>
            <p style="margin:0 0 8px; font-size:0.86rem; color:#7f1d1d; line-height:1.5;">
              • <strong>Interdiction stricte :</strong> Interdiction absolue d'interpoler ou de relier ces observations par une courbe continue.<br>
              • <strong>Comparabilité limitée :</strong> Les trois points correspondent à des enquêtes nationales distinctes ayant des méthodologies de collecte et des populations cibles différentes :
            </p>
            <div class="data-table-wrapper" style="border:1px solid #fca5a5; border-radius:6px; background:#fff;">
              <table class="data-table data-table-sm" style="margin:0;">
                <thead>
                  <tr style="background:#fee2e2;">
                    <th>Année</th>
                    <th>Enquête statistique</th>
                    <th>Tranche d'âge cible</th>
                    <th>Taux mesuré</th>
                    <th>Rupture constatée</th>
                  </tr>
                </thead>
                <tbody>
                  <tr ${new Date(obs.period_start).getFullYear() === 2010 ? 'style="background:#fef2f2; font-weight:700;"' : ''}>
                    <td>2010</td>
                    <td>EESI 2 (Enquête Emploi &amp; Secteur Informel)</td>
                    <td>15 ans et plus</td>
                    <td>3,8 %</td>
                    <td>Enquête spécifique emploi (hors cadre ECAM)</td>
                  </tr>
                  <tr ${new Date(obs.period_start).getFullYear() === 2014 ? 'style="background:#fef2f2; font-weight:700;"' : ''}>
                    <td>2014</td>
                    <td>ECAM 4 (Enquête Ménages)</td>
                    <td>15 à 64 ans</td>
                    <td>3,9 %</td>
                    <td>Enquête ménages générale, tranche 15-64 ans</td>
                  </tr>
                  <tr ${new Date(obs.period_start).getFullYear() === 2021 ? 'style="background:#fef2f2; font-weight:700;"' : ''}>
                    <td>2021</td>
                    <td>ECAM 5 (Enquête Ménages post-COVID)</td>
                    <td>15 à 64 ans</td>
                    <td>4,3 %</td>
                    <td>Enquête ménages post-choc COVID (2021/2022)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        `;
      } else if (obs.indicator_code === 'EDU_PRIM_GROSS') {
        methodologyAlertHtml = `
          <div class="data-methodology-card info">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <i data-lucide="graduation-cap" style="color:#0284c7; width:20px; height:20px;"></i>
              <strong style="color:#0369a1; font-size:0.95rem;">Règle Méthodologique : Taux Brut de Scolarisation primaire (TBS)</strong>
            </div>
            <p style="margin:0 0 6px; font-size:0.86rem; color:#334155; line-height:1.5;">
              • <strong>Année scolaire exacte :</strong> <span class="data-tag-school-year">${escapeHTML(obs.school_year || 'Année scolaire')}</span> (correspondant à l'exercice statistique civil ${new Date(obs.period_start).getFullYear()}).<br>
              • <strong>Définition officielle du TBS :</strong> Rapport exprimé en pourcentage entre l'ensemble des élèves inscrits au cycle primaire (quel que soit leur âge) et l'effectif total de la population théorique scolarisable officielle (6 à 11 ans au Cameroun).<br>
              • <strong>Pourquoi le taux excède-t-il 100 % ?</strong> La valeur supérieure à 100 % (ex: ${obs.value_numeric} %) s'explique mécaniquement par l'inscription d'enfants hors de la tranche d'âge théorique (enfants précoces de moins de 6 ans et enfants tardifs de plus de 11 ans) ainsi que par un volume significatif d'élèves redoublants.
            </p>
          </div>
        `;
      }

      // Visualiseur statistique
      const visualizerHtml = renderSeriesVisualizer(obs, seriesItems);

      const evEval = obs.evidence_evaluation || {};
      const distinctStatuses = evEval.distinct_statuses || {
        audit_decision: obs.audit_decision || 'pending',
        editorial_status: obs.editorial_status,
        document_status: (obs.sources && obs.sources[0]?.documentary_tier) ? 'institutional_reference_only' : 'unavailable',
        methodological_robustness: (obs.sources && obs.sources[0]?.methodological_robustness) || 'high'
      };

      // Fiche d'inspection complète
      dossierBox.innerHTML = `
        <div class="data-dossier-header">
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <span class="data-tag-revision">Révision R${obs.revision_number || 1}</span>
              ${getStatusBadge(obs.editorial_status)}
              ${auditStatusBadge}
              ${auditDecisionBadge}
              ${isPilot ? '<span style="background:#fef3c7; color:#92400e; font-weight:700; font-size:0.75rem; padding:2px 8px; border-radius:4px; border:1px solid #fde68a;">Pilote Lot 3C</span>' : ''}
            </div>
            <h3 style="font-family:'Playfair Display'; font-size:1.35rem; margin:8px 0 4px; color:#0f172a;">
              ${escapeHTML(obs.indicator_name)}
            </h3>
            <div style="font-size:0.83rem; color:#64748b;">
              Code : <strong>${escapeHTML(obs.indicator_code)}</strong> | 
              Domaine : <strong>${escapeHTML(obs.indicator_category || 'Général')}</strong> (${escapeHTML(obs.indicator_subdomain || 'Principal')}) | 
              Territoire : <strong>${escapeHTML(obs.territory_name)} (${escapeHTML(obs.territory_code)})</strong>
            </div>
          </div>
          <button type="button" class="data-btn data-btn-xs data-btn-secondary" onclick="SolitiquoDataAdmin.openDetailView(${obs.id})">
            <i data-lucide="maximize-2"></i> Plein écran
          </button>
        </div>

        <div class="data-dossier-body">
          <!-- Panneau des 4 Statuts Distincts (Lot 3E.3.3) -->
          <div class="data-card" style="padding:14px 18px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; margin-bottom:14px;">
            <div style="font-weight:700; font-size:0.82rem; text-transform:uppercase; letter-spacing:0.04em; color:#475569; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
              <i data-lucide="layers" style="width:15px; height:15px; color:#2563eb;"></i>
              Gouvernance Multi-Niveaux — 4 Notions Strictement Distinctes (Lot 3E.3.3)
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px;">
              <div style="background:#fff; padding:10px 12px; border-radius:6px; border:1px solid #e2e8f0;">
                <div style="font-size:0.72rem; color:#64748b; font-weight:700; text-transform:uppercase;">1. Contrôle Technique (Ingestion)</div>
                <div style="margin-top:4px;">${auditStatusBadge}</div>
                <div style="font-size:0.68rem; color:#64748b; margin-top:2px;">Contrôle automatisé de schéma et syntaxe</div>
              </div>
              <div style="background:#fff; padding:10px 12px; border-radius:6px; border:1px solid #e2e8f0;">
                <div style="font-size:0.72rem; color:#64748b; font-weight:700; text-transform:uppercase;">2. Décision Humaine (Arbitrage)</div>
                <div style="margin-top:4px;">${auditDecisionBadge}</div>
                <div style="font-size:0.68rem; color:#64748b; margin-top:2px;">Arbitrage explicite par administrateur habilité</div>
              </div>
              <div style="background:#fff; padding:10px 12px; border-radius:6px; border:1px solid #e2e8f0;">
                <div style="font-size:0.72rem; color:#64748b; font-weight:700; text-transform:uppercase;">3. Statut Éditorial (Diffusion)</div>
                <div style="margin-top:4px;">${getStatusBadge(obs.editorial_status)}</div>
                <div style="font-size:0.68rem; color:#64748b; margin-top:2px;">${obs.editorial_status === 'published' ? 'Diffusé publiquement' : 'Brouillon privé non diffusé'}</div>
              </div>
              <div style="background:#fff; padding:10px 12px; border-radius:6px; border:1px solid #e2e8f0;">
                <div style="font-size:0.72rem; color:#64748b; font-weight:700; text-transform:uppercase;">4. Preuve Documentaire (Matérialité)</div>
                <div style="margin-top:4px;">
                  <span class="data-badge" style="font-size:0.75rem; font-weight:700; ${distinctStatuses.document_status === 'original_consulted' ? 'background:#dcfce7; color:#15803d;' : (distinctStatuses.document_status === 'institutional_reference_only' ? 'background:#fef3c7; color:#92400e;' : 'background:#fee2e2; color:#b91c1c;')}">
                    ${escapeHTML(distinctStatuses.document_status)}
                  </span>
                </div>
                <div style="font-size:0.68rem; color:#64748b; margin-top:2px;">${evEval.is_pdf_archived ? 'PDF archivé (SHA-256 certifié)' : 'PDF original non archivé'}</div>
              </div>
            </div>
          </div>

          <!-- Les 3 Niveaux de Qualification de la Preuve Statistique (Lot 3E.3.3) -->
          <div class="data-card" style="padding:14px 18px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; margin-bottom:14px;">
            <div style="font-weight:700; font-size:0.84rem; text-transform:uppercase; letter-spacing:0.04em; color:#0369a1; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
              <i data-lucide="file-check-2" style="width:16px; height:16px; color:#0284c7;"></i>
              Les 3 Niveaux de Qualification de la Preuve Statistique (Lot 3E.3.3)
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
              <div style="background:#fff; padding:10px; border-radius:6px; border:1px solid #e0f2fe;">
                <div style="font-size:0.73rem; font-weight:800; color:#0369a1;">Niveau 1 — Provenance Informatique</div>
                <div style="font-size:0.8rem; color:#1e293b; margin-top:3px;">
                  Fichier importé : <code>solitiquo_data_lot3c_pilot_cameroun.csv</code>
                </div>
                <div style="font-size:0.71rem; color:#059669; font-weight:600; margin-top:2px;">
                  ✓ Horodaté &amp; journalisé (Audit log intègre)
                </div>
              </div>
              <div style="background:#fff; padding:10px; border-radius:6px; border:1px solid #e0f2fe;">
                <div style="font-size:0.73rem; font-weight:800; color:#0369a1;">Niveau 2 — Référence Institutionnelle</div>
                <div style="font-size:0.8rem; color:#1e293b; margin-top:3px;">
                  Source : <strong>${escapeHTML(obs.sources && obs.sources[0]?.source_acronym ? obs.sources[0].source_acronym : 'INS')}</strong> — ${escapeHTML(obs.sources && obs.sources[0]?.citation_reference ? obs.sources[0].citation_reference : 'Réf. paginée')}
                </div>
                <div style="font-size:0.71rem; color:#0284c7; font-weight:600; margin-top:2px;">
                  ✓ Rattaché au catalogue de publications
                </div>
              </div>
              <div style="background:#fff; padding:10px; border-radius:6px; border:1px solid #e0f2fe;">
                <div style="font-size:0.73rem; font-weight:800; color:#0369a1;">Niveau 3 — Vérification Documentaire</div>
                <div style="font-size:0.8rem; color:#1e293b; margin-top:3px;">
                  PDF original &amp; consultation matérielle du tableau
                </div>
                <div style="font-size:0.71rem; font-weight:700; margin-top:2px; ${evEval.is_pdf_archived ? 'color:#15803d;' : 'color:#dc2626;'}">
                  ${evEval.is_pdf_archived ? '✓ PDF archivé localement (SHA-256 certifié)' : '❌ Non vérifié matériellement (Document absent)'}
                </div>
              </div>
            </div>
            ${!evEval.is_pdf_archived ? `
              <div style="margin-top:8px; font-size:0.76rem; color:#991b1b; background:#fee2e2; padding:6px 10px; border-radius:4px; font-weight:600;">
                ⚠️ Limite méthodologique stricte : La provenance informatique (Niveau 1) et la citation (Niveau 2) ne constituent PAS une vérification statistique. Tant que le document original n'est pas consulté et archivé, la valeur reste « Non vérifiée matériellement ».
              </div>
            ` : ''}
          </div>

          <!-- Contrôle Préalable des Preuves & Alerte Archivage (Lot 3E.3) -->
          <div class="data-card" style="padding:16px; margin-bottom:14px; border-radius:8px; ${evEval.is_pdf_archived ? 'background:#f0fdf4; border:1.5px solid #86efac;' : 'background:#fffbeb; border:1.5px solid #fde68a;'}">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
              <div>
                <div style="font-weight:700; font-size:0.92rem; ${evEval.is_pdf_archived ? 'color:#166534;' : 'color:#92400e;'} display:flex; align-items:center; gap:8px;">
                  <i data-lucide="${evEval.is_pdf_archived ? 'shield-check' : 'shield-alert'}" style="width:20px; height:20px;"></i>
                  Contrôle Préalable des Preuves &amp; Archivage Certifié (Lot 3E.3)
                </div>
                <div style="font-size:0.84rem; margin-top:6px; line-height:1.5; ${evEval.is_pdf_archived ? 'color:#15803d;' : 'color:#78350f;'}">
                  ${escapeHTML(evEval.guidance_message || '')}
                </div>
                <div style="display:flex; gap:16px; margin-top:8px; font-size:0.78rem; flex-wrap:wrap;">
                  <span><strong>Fichier PDF original :</strong> ${evEval.is_pdf_archived ? '<span style="color:#15803d; font-weight:700;">✓ Archivé localement (SHA-256 certifié)</span>' : '<span style="color:#b91c1c; font-weight:700;">❌ Non archivé localement</span>'}</span>
                  <span><strong>Statut de preuve :</strong> <code>${escapeHTML(evEval.document_status || 'unavailable')}</code></span>
                  <span><strong>Arbitrage recommandé :</strong> <strong style="color:${evEval.proposed_decision === 'accepted' ? '#15803d' : '#b45309'}; text-transform:uppercase;">${escapeHTML(evEval.proposed_decision || 'pending_evidence')}</strong></span>
                </div>
              </div>
              ${!evEval.is_pdf_archived ? `
                <div style="background:#fef3c7; border:1px solid #fde68a; padding:6px 10px; border-radius:6px; text-align:right;">
                  <div style="font-size:0.7rem; font-weight:700; color:#b45309; text-transform:uppercase;">Garde-Fou Absolu</div>
                  <div style="font-size:0.76rem; color:#92400e; font-weight:600;">Validation et publication bloquées sans acceptation d'audit</div>
                </div>
              ` : ''}
            </div>
          </div>
          <!-- 1. Carte Valeur Statistique & Période -->
          <div class="data-dossier-value-card">
            <div>
              <span style="font-size:0.78rem; font-weight:700; text-transform:uppercase; color:#64748b;">
                Valeur mesurée (${obs.period_type})
              </span>
              <div class="data-dossier-value-num">
                ${obs.value_numeric !== null ? formatNumber(obs.value_numeric) : (obs.value_text || `[${obs.missing_reason}]`)}
                <span style="font-size:1.15rem; font-weight:600; color:#64748b;">${escapeHTML(obs.indicator_unit || '')}</span>
              </div>
              <div style="font-size:0.84rem; color:#475569; margin-top:4px;">
                Période statistique : <strong>${formatDate(obs.period_start)}</strong> au <strong>${formatDate(obs.period_end)}</strong>
                ${obs.school_year ? ` &bull; <span class="data-tag-school-year">${escapeHTML(obs.school_year)}</span>` : ''}
              </div>
            </div>
            <div style="text-align:right; display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
              <span class="data-nature-badge ${obs.methodology_nature}">
                <i data-lucide="${obs.methodology_nature === 'projection' ? 'compass' : (obs.methodology_nature === 'sample_survey' ? 'users' : 'file-spreadsheet')}"></i>
                ${getNatureLabel(obs.methodology_nature)}
              </span>
              ${obs.survey_or_account_status ? `
                <span class="data-statut-comptes ${getAccountStatusClass(obs.survey_or_account_status)}">
                  ${escapeHTML(obs.survey_or_account_status)}
                </span>
              ` : ''}
            </div>
          </div>

          <!-- 2. Définition officielle et formule de calcul de l'indicateur -->
          <div class="data-card" style="padding:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <div style="font-weight:700; font-size:0.88rem; color:#0f172a;">Définition officielle de l'indicateur :</div>
              <span style="font-size:0.78rem; color:#64748b;">Producteur : <strong>${escapeHTML(obs.indicator_producer_institution || 'INS')}</strong></span>
            </div>
            <p style="font-size:0.86rem; color:#334155; margin:0 0 8px; line-height:1.45;">
              ${escapeHTML(obs.indicator_description || 'Définition officielle enregistrée au catalogue.')}
            </p>
            ${obs.indicator_calculation_formula ? `
              <div style="font-size:0.82rem; color:#475569; background:#f8fafc; padding:8px 12px; border-radius:6px; border:1px solid #e2e8f0;">
                <strong>Formule de calcul :</strong> <code>${escapeHTML(obs.indicator_calculation_formula)}</code>
              </div>
            ` : ''}
            ${obs.methodology_notes ? `
              <div style="font-size:0.83rem; color:#0f766e; background:#f0fdfa; padding:9px 13px; border-radius:6px; border:1px solid #ccfbf1; margin-top:8px;">
                <strong><i data-lucide="info" style="width:13px;height:13px;display:inline;vertical-align:text-bottom;"></i> Spécificité méthodologique de l'observation :</strong>
                <div style="margin-top:2px;">${escapeHTML(obs.methodology_notes)}</div>
              </div>
            ` : ''}
          </div>

          <!-- 3. Traitement spécifique des réserves méthodologiques -->
          ${methodologyAlertHtml}

          <!-- 4. Réserves constatées lors de l'Audit 3C.1 -->
          ${obs.audit_caveat ? `
            <div class="data-card" style="padding:16px; border-left:4px solid #b45309; background:#fffbeb;">
              <div style="font-weight:700; font-size:0.88rem; color:#92400e; margin-bottom:4px;">
                <i data-lucide="shield-alert" style="width:16px;height:16px;display:inline;vertical-align:text-bottom;"></i>
                Réserves méthodologiques issues du contrôle technique d'ingestion :
              </div>
              <p style="font-size:0.86rem; color:#78350f; margin:0; line-height:1.45;">
                ${escapeHTML(obs.audit_caveat)}
              </p>
            </div>
          ` : ''}

          <!-- 5. Visualiseur Statistique Conforme -->
          ${visualizerHtml}

          <!-- 5bis. Comparateur de Concordance Documentaire & Examen Critique (Lot 3E) -->
          <div class="data-card" style="padding:16px; background:#fcfbf9; border:1px solid #e7e5e4; border-radius:8px;">
            <div style="font-weight:700; font-size:0.9rem; color:#1c1917; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
              <i data-lucide="scale" style="width:16px;height:16px;color:#d97706;"></i>
              Comparateur de Concordance &amp; Examen Critique Documentaire (Lot 3E)
            </div>
            <div class="data-table-wrapper" style="border:1px solid #d6d3d1; border-radius:6px; background:#fff;">
              <table class="data-table data-table-sm" style="margin:0;">
                <thead>
                  <tr style="background:#f5f5f4;">
                    <th>Paramètre d'audit</th>
                    <th>Valeur en Base Solitiquo</th>
                    <th>Donnée Source Primaire</th>
                    <th>Conformité &amp; Évaluation</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Valeur &amp; Unité</strong></td>
                    <td style="font-size:0.92rem; font-weight:700; color:#0f172a;">
                      ${formatNumber(obs.value_numeric)} ${escapeHTML(obs.indicator_unit || '')}
                    </td>
                    <td style="font-size:0.83rem; color:#44403c;">
                      ${escapeHTML(obs.sources && obs.sources[0]?.citation_reference ? obs.sources[0].citation_reference : 'Non renseignée')}
                    </td>
                    <td>
                      <span class="data-badge" style="font-size:0.7rem; ${evEval.is_pdf_archived ? 'background:#dcfce7; color:#15803d;' : 'background:#fef3c7; color:#92400e;'}">
                        ${evEval.is_pdf_archived ? '✓ Vérifié dans le document archivé' : 'Concordance bibliographique déclarée (Vérification matérielle en attente)'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Nature Méthodologique</strong></td>
                    <td><span class="data-nature-badge ${obs.methodology_nature}">${getNatureLabel(obs.methodology_nature)}</span></td>
                    <td style="font-size:0.82rem; color:#44403c;">${escapeHTML(obs.survey_or_account_status || 'Cadre officiel institutionnel')}</td>
                    <td>
                      <span class="data-badge" style="font-size:0.7rem; background:#f3f4f6; color:#374151;">
                        ${obs.methodology_nature === 'projection' ? 'Projection extrapolée' : (obs.methodology_nature === 'sample_survey' ? 'Enquête par échantillonnage' : 'Comptes / Registre')}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td><strong>Qualification Documentaire</strong></td>
                    <td>
                      <span style="font-weight:700; font-size:0.78rem; color:#0f766e;">
                        ${escapeHTML(obs.sources && obs.sources[0]?.documentary_tier ? obs.sources[0].documentary_tier : 'TIER_1_OFFICIAL')}
                      </span>
                    </td>
                    <td style="font-size:0.82rem; color:#44403c;">
                      ${escapeHTML(obs.sources && obs.sources[0]?.source_name ? obs.sources[0].source_name : 'Institution nationale')} (${escapeHTML(obs.sources && obs.sources[0]?.source_acronym ? obs.sources[0].source_acronym : 'INS')})
                    </td>
                    <td>
                      <span class="data-badge" style="font-size:0.7rem; background:#e0f2fe; color:#0369a1;">
                        Source Primaire Qualifiée
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- 6. Preuves documentaires et consultation directe (Lot 3C.3 & 3E) -->
          <div>
            <div class="data-subtable-title" style="display:flex; justify-content:space-between; align-items:center;">
              <span>Preuves documentaires et consultation directe (${obs.sources?.length || 0}) :</span>
              <span style="font-size:0.75rem; color:#64748b; font-weight:normal;">Vérification de la publication originale</span>
            </div>
            <div class="data-table-wrapper" style="border:1px solid #e2e8f0; border-radius:8px;">
              <table class="data-table data-table-sm">
                <thead>
                  <tr>
                    <th>Institution &amp; Tier</th>
                    <th>Rôle &amp; Robustesse</th>
                    <th>Publication &amp; Citation officielle</th>
                    <th>Localisation &amp; Consultation</th>
                  </tr>
                </thead>
                <tbody>
                  ${(obs.sources || []).map(s => {
                    const isAvailable = Boolean(s.citation_url || s.website_url);
                    const citeRef = s.citation_reference || '';
                    const isDirectPdf = (s.citation_url || '').toLowerCase().endsWith('.pdf');
                    return `
                      <tr>
                        <td>
                          <strong>${escapeHTML(s.source_acronym || s.source_name)}</strong>
                          <div style="font-size:0.7rem; color:#64748b;">${escapeHTML(s.source_name)}</div>
                          <div style="font-size:0.68rem; ${s.documentary_tier ? 'color:#0f766e; font-weight:700;' : 'color:#b45309; font-weight:600;'}">${escapeHTML(s.documentary_tier || 'Non qualifiée (Tier manquant)')}</div>
                        </td>
                        <td>
                          <span style="font-weight:700; color:#37463D;">${escapeHTML(s.source_role)}</span>
                          <div style="margin-top:2px;">
                            <span class="data-pill-btn" style="${s.methodological_robustness === 'high' ? 'background:#dcfce7; color:#15803d;' : (s.methodological_robustness ? 'background:#fef3c7; color:#b45309;' : 'background:#fee2e2; color:#b91c1c;')}">
                              Robustesse: ${escapeHTML(s.methodological_robustness || 'Non qualifiée')}
                            </span>
                          </div>
                        </td>
                        <td style="max-width:320px;">
                          <div style="font-size:0.85rem; color:#1e293b; font-weight:600;">${escapeHTML(citeRef)}</div>
                          <div style="font-size:0.72rem; color:#64748b; margin-top:2px;">
                            ${evEval.is_pdf_archived 
                              ? '<span style="color:#059669; font-weight:700;"><i data-lucide="check" style="width:12px;height:12px;display:inline;"></i> Document original archivé et vérifié (SHA-256 certifié)</span>'
                              : (isAvailable 
                                  ? '<span style="color:#b45309; font-weight:700;"><i data-lucide="globe" style="width:12px;height:12px;display:inline;"></i> Référence web institutionnelle (Document original non archivé)</span>'
                                  : '<span style="color:#e11d48; font-weight:700;"><i data-lucide="alert-triangle" style="width:12px;height:12px;display:inline;"></i> Document original non disponible</span>')}
                          </div>
                          ${s.notes ? `
                            <div style="font-size:0.71rem; color:#475569; margin-top:4px; background:#f8fafc; padding:4px 7px; border-radius:4px; border:1px solid #e2e8f0; line-height:1.35;">
                              ${escapeHTML(s.notes)}
                            </div>
                          ` : ''}
                        </td>
                        <td style="min-width:200px;">
                          ${isAvailable ? `
                            <a href="${escapeHTML(s.citation_url || s.website_url)}" target="_blank" rel="noopener noreferrer" class="data-btn data-btn-xs ${isDirectPdf ? 'data-btn-primary' : 'data-btn-secondary'}" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:700; padding:4px 10px;">
                              <i data-lucide="${isDirectPdf ? 'file-text' : 'globe'}" style="width:13px;height:13px;"></i>
                              ${isDirectPdf ? 'Ouvrir le PDF original' : 'Accéder au portail officiel'}
                              <i data-lucide="external-link" style="width:11px;height:11px;"></i>
                            </a>
                            <div style="font-size:0.72rem; color:#475569; margin-top:4px;">
                              <i data-lucide="bookmark" style="width:11px;height:11px;display:inline;"></i> Repère cité : <em>${escapeHTML(citeRef)}</em>
                            </div>
                          ` : `
                            <div style="padding:6px 10px; background:#fff1f2; border:1px solid #fecdd3; border-radius:6px;">
                              <div style="font-size:0.75rem; font-weight:700; color:#e11d48;">Document original non disponible</div>
                              <div style="font-size:0.7rem; color:#9f1239; margin:2px 0 4px;">Ne pas prétendre que la valeur a été vérifiée dans le document.</div>
                              <button type="button" class="data-btn data-btn-xs data-btn-secondary" onclick="SolitiquoDataAdmin.promptRequestEvidence(${obs.id}, '${escapeHTML(s.source_acronym || 'Source')}')">
                                <i data-lucide="file-plus" style="width:11px;height:11px;"></i> Demander une pièce justificative
                              </button>
                            </div>
                          `}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- 6bis. Publications officielles associées dans le corpus vérifié (Lot 3E) -->
          ${(obs.indicator_publications && obs.indicator_publications.length > 0) ? `
            <div class="data-card" style="padding:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
              <div style="font-weight:700; font-size:0.86rem; color:#0f172a; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                <i data-lucide="book-open" style="width:15px;height:15px;color:#0f766e;"></i>
                Corpus documentaire officiel associé à cet indicateur (${obs.indicator_publications.length} publication${obs.indicator_publications.length > 1 ? 's' : ''}) :
              </div>
              <div class="data-table-wrapper" style="border:1px solid #cbd5e1; border-radius:6px; background:#fff;">
                <table class="data-table data-table-sm" style="margin:0;">
                  <thead>
                    <tr style="background:#f1f5f9;">
                      <th>Année</th>
                      <th>Titre officiel de la publication</th>
                      <th>Catégorie</th>
                      <th>Statut</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${obs.indicator_publications.map(p => `
                      <tr>
                        <td style="font-weight:700;">${p.publication_year || '—'}</td>
                        <td style="font-size:0.82rem; color:#1e293b;">
                          <strong>${escapeHTML(p.title)}</strong>
                          ${p.bibliographic_reference ? `<div style="font-size:0.7rem; color:#64748b;">${escapeHTML(p.bibliographic_reference)}</div>` : ''}
                        </td>
                        <td><span style="font-size:0.72rem; color:#475569;">${escapeHTML(p.document_category)}</span></td>
                        <td>
                          <span class="data-badge" style="font-size:0.68rem; ${
                            p.verification_status === 'verified_consulted'
                              ? 'background:#dcfce7; color:#15803d;'
                              : (p.verification_status === 'institutional_reference_only'
                                  ? 'background:#e0f2fe; color:#0369a1;'
                                  : (p.verification_status === 'unavailable' || p.verification_status === 'unavailable_or_broken'
                                      ? 'background:#ffe4e6; color:#9f1239;'
                                      : 'background:#f1f5f9; color:#475569;'))
                          }">
                            ${escapeHTML(p.verification_status)}
                          </span>
                        </td>
                        <td>
                          ${p.url ? `
                            <a href="${escapeHTML(p.url)}" target="_blank" rel="noopener noreferrer" class="data-btn data-btn-xs data-btn-secondary" style="text-decoration:none; display:inline-flex; align-items:center; gap:3px;">
                              <i data-lucide="external-link" style="width:11px;height:11px;"></i> Ouvrir
                            </a>
                          ` : '—'}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}

          <!-- 6ter. Pièces justificatives administratives enregistrées (Lot 3E) -->
          ${(obs.audit_evidence_url || obs.audit_evidence_reference) ? `
            <div class="data-card" style="padding:14px; background:#f0fdf4; border-left:4px solid #16a34a; border-radius:8px;">
              <div style="font-weight:700; font-size:0.88rem; color:#15803d; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                <i data-lucide="file-check" style="width:16px;height:16px;"></i>
                Pièce justificative enregistrée pour cet audit :
              </div>
              <div style="font-size:0.84rem; color:#166534;">
                ${obs.audit_evidence_reference ? `<strong>Référence :</strong> ${escapeHTML(obs.audit_evidence_reference)}<br>` : ''}
                ${obs.audit_evidence_url ? `
                  <div style="margin-top:6px;">
                    <a href="${escapeHTML(obs.audit_evidence_url)}" target="_blank" rel="noopener noreferrer" class="data-btn data-btn-xs data-btn-primary" style="text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:700;">
                      <i data-lucide="download" style="width:12px;height:12px;"></i> Télécharger / Consulter la pièce justificative
                      <i data-lucide="external-link" style="width:10px;height:10px;"></i>
                    </a>
                  </div>
                ` : ''}
              </div>
            </div>
          ` : ''}

          <!-- 6quater. Traçabilité Matérielle et Preuves d'Archivage (Lot 3E.3.5) -->
          <div class="data-card" style="padding:14px; background:#fbfcfe; border:1px solid #cbd5e1; border-radius:8px; margin-bottom:14px;">
            <div style="font-weight:700; font-size:0.86rem; color:#0f172a; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
              <i data-lucide="archive" style="width:15px;height:15px;color:#0369a1;"></i>
              Traçabilité Matérielle et Preuves d'Archivage (Lot 3E.3.5)
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:10px; margin-bottom:10px;">
              <div style="background:#fff; padding:10px; border-radius:6px; border:1px solid #e2e8f0;">
                <div style="font-size:0.72rem; font-weight:700; color:#64748b; text-transform:uppercase;">État de vérification matérielle</div>
                <div style="margin-top:4px;">
                  <span class="data-badge" style="font-size:0.75rem; ${
                    evEval.document_status === 'original_consulted' ? 'background:#dcfce7; color:#15803d;' :
                    (evEval.document_status === 'institutional_reference_only' ? 'background:#e0f2fe; color:#0369a1;' : 'background:#fee2e2; color:#b91c1c;')
                  }">
                    ${evEval.document_status === 'original_consulted' ? '✓ Original consulté et archivé' :
                      (evEval.document_status === 'institutional_reference_only' ? 'ℹ Référence institutionnelle seule' : '❌ Document indisponible')}
                  </span>
                </div>
                <div style="font-size:0.72rem; color:#475569; margin-top:4px;">
                  Fichier physique : <strong>${evEval.is_pdf_archived ? 'Présent dans storage/ (SHA-256 certifié)' : 'Absent du coffre local'}</strong>
                </div>
              </div>
              <div style="background:#fff; padding:10px; border-radius:6px; border:1px solid #e2e8f0;">
                <div style="font-size:0.72rem; font-weight:700; color:#64748b; text-transform:uppercase;">Résultat de confrontation statistique</div>
                <div style="margin-top:4px;">
                  <span class="data-badge" style="font-size:0.75rem; ${
                    evEval.confrontation_result === 'exact_match' ? 'background:#dcfce7; color:#15803d;' :
                    (evEval.confrontation_result === 'match_with_rounding' ? 'background:#fef3c7; color:#92400e;' :
                    (evEval.confrontation_result === 'methodological_difference' ? 'background:#ede9fe; color:#6d28d9;' : 'background:#f1f5f9; color:#475569;'))
                  }">
                    ${escapeHTML(evEval.confrontation_result || 'not_verifiable')}
                  </span>
                </div>
                <div style="font-size:0.72rem; color:#475569; margin-top:4px;">
                  ${escapeHTML(evEval.confrontation_details || 'Aucune confrontation matérielle possible.')}
                </div>
              </div>
            </div>
            ${(obs.document_evidences && obs.document_evidences.length > 0) ? `
              <div class="data-table-wrapper" style="border:1px solid #e2e8f0; border-radius:6px; background:#fff;">
                <table class="data-table data-table-sm" style="margin:0;">
                  <thead>
                    <tr style="background:#f8fafc;">
                      <th>Document</th>
                      <th>Fichier &amp; Empreinte SHA-256</th>
                      <th>Collecte &amp; URL</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${obs.document_evidences.map(e => `
                      <tr>
                        <td style="font-size:0.8rem;">
                          <strong>${escapeHTML(e.title)}</strong>
                          <div style="font-size:0.7rem; color:#64748b;">${escapeHTML(e.institution_acronym)} (${e.publication_year || '—'})</div>
                          <div style="font-size:0.68rem; color:#475569;">${escapeHTML(e.page_section_reference || '')}</div>
                        </td>
                        <td style="font-size:0.72rem;">
                          ${e.file_path ? `
                            <div style="font-weight:700; color:#0f766e;"><i data-lucide="file-check" style="width:12px;height:12px;display:inline;"></i> ${escapeHTML(e.file_path.split(/[\\\\/]/).pop())}</div>
                            <div>Taille : ${e.file_size_bytes ? Math.round(e.file_size_bytes / 1024) + ' Ko' : '—'}</div>
                            <div style="font-family:monospace; color:#475569;">SHA-256 : ${e.sha256_hash ? e.sha256_hash.slice(0, 16) + '...' : '—'}</div>
                          ` : '<span style="color:#b91c1c; font-weight:600;">❌ Fichier original non archivé</span>'}
                        </td>
                        <td style="font-size:0.72rem;">
                          ${e.retrieval_date ? `<div>Date : ${formatDate(e.retrieval_date)}</div>` : '<div>Date : non renseignée</div>'}
                          ${e.original_url ? `
                            <a href="${escapeHTML(e.original_url)}" target="_blank" rel="noopener noreferrer" style="color:#0284c7; text-decoration:none; display:inline-flex; align-items:center; gap:2px; margin-top:2px;">
                              <i data-lucide="external-link" style="width:10px;height:10px;"></i> ${escapeHTML(e.original_url.slice(0, 35))}...
                            </a>
                          ` : '—'}
                        </td>
                        <td>
                          <span class="data-badge" style="font-size:0.68rem; ${
                            e.document_status === 'original_consulted' ? 'background:#dcfce7; color:#15803d;' :
                            (e.document_status === 'institutional_reference_only' ? 'background:#e0f2fe; color:#0369a1;' : 'background:#fee2e2; color:#b91c1c;')
                          }">
                            ${escapeHTML(e.document_status)}
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : ''}
          </div>

          <!-- 6quinquies. Diagnostic d'Éligibilité à la Diffusion Publique (Lot 3E.4) -->
          <div class="data-card" style="padding:14px; border-radius:8px; margin-bottom:14px; ${
            obs.publication_eligibility?.is_eligible 
              ? 'background:#f0fdf4; border:1.5px solid #86efac;' 
              : 'background:#fef2f2; border:1.5px solid #fca5a5;'
          }">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
              <div style="font-weight:700; font-size:0.9rem; color:${obs.publication_eligibility?.is_eligible ? '#15803d' : '#991b1b'}; display:flex; align-items:center; gap:6px;">
                <i data-lucide="${obs.publication_eligibility?.is_eligible ? 'check-circle' : 'shield-alert'}" style="width:18px;height:18px;"></i>
                Diagnostic d'Éligibilité à la Diffusion Publique (Lot 3E.4)
              </div>
              <span class="data-badge" style="font-size:0.75rem; font-weight:700; ${
                obs.publication_eligibility?.is_eligible ? 'background:#dcfce7; color:#15803d;' : 'background:#fee2e2; color:#b91c1c;'
              }">
                ${obs.publication_eligibility?.is_eligible ? '✓ Dossier Complet & Éligible' : '❌ Non Publiable en l\'état'}
              </span>
            </div>
            
            <div style="font-size:0.82rem; color:#334155; margin-bottom:8px;">
              ${obs.publication_eligibility?.is_eligible 
                ? 'Cette observation satisfait tous les critères préalables de conformité technique, documentaire et méthodologique.' 
                : 'La diffusion publique de cette observation est formellement bloquée pour les motifs suivants :'}
            </div>

            ${(!obs.publication_eligibility?.is_eligible && obs.publication_eligibility?.blockers?.length > 0) ? `
              <ul style="margin:0 0 10px 18px; padding:0; font-size:0.8rem; color:#7f1d1d; line-height:1.5;">
                ${obs.publication_eligibility.blockers.map(b => `<li>${escapeHTML(b)}</li>`).join('')}
              </ul>
            ` : ''}

            <!-- 3 Volets de Contrôle distincts -->
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:8px; font-size:0.75rem;">
              <div style="padding:6px 10px; border-radius:5px; background:#fff; border:1px solid #e2e8f0;">
                <span style="font-weight:700;">1. Contrôle Technique :</span> 
                ${obs.publication_eligibility?.breakdown?.technical?.passed ? '<span style="color:#15803d; font-weight:700;">✓ Conforme</span>' : '<span style="color:#b91c1c; font-weight:700;">❌ Incomplet</span>'}
              </div>
              <div style="padding:6px 10px; border-radius:5px; background:#fff; border:1px solid #e2e8f0;">
                <span style="font-weight:700;">2. Contrôle Documentaire :</span> 
                ${obs.publication_eligibility?.breakdown?.documentary?.passed ? '<span style="color:#15803d; font-weight:700;">✓ Conforme</span>' : '<span style="color:#b91c1c; font-weight:700;">❌ Preuve requise</span>'}
              </div>
              <div style="padding:6px 10px; border-radius:5px; background:#fff; border:1px solid #e2e8f0;">
                <span style="font-weight:700;">3. Contrôle Méthodologique :</span> 
                ${obs.publication_eligibility?.breakdown?.methodological?.passed ? '<span style="color:#15803d; font-weight:700;">✓ Conforme</span>' : '<span style="color:#b91c1c; font-weight:700;">❌ Arbitrage requis</span>'}
              </div>
            </div>
          </div>

          <!-- 7. Décisions de la Commission Éditoriale & Méthodologique (Lot 3C.3) -->
          ${isAdmin ? `
            <div class="data-card" style="padding:18px; background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:8px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                <div>
                  <h4 style="font-family:'Playfair Display'; margin:0; font-size:1.15rem; color:#0f172a;">
                    Décision de la Commission Éditoriale &amp; Méthodologique
                  </h4>
                  <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">
                    Chaque décision humaine est tracée, horodatée et enregistrée de manière inaltérable.
                  </div>
                </div>
                ${auditDecisionBadge}
              </div>

              <!-- Arbitrage recommandé selon les preuves (Lot 3E.3) -->
              ${evEval.proposed_decision ? `
                <div style="font-size:0.82rem; background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; padding:8px 12px; border-radius:6px; margin-bottom:12px; display:flex; align-items:flex-start; gap:8px;">
                  <i data-lucide="info" style="width:16px; height:16px; flex-shrink:0; margin-top:2px;"></i>
                  <div>
                    <strong>Recommandation protocole Lot 3E.3 :</strong> Arbitrage proposé = <strong style="text-transform:uppercase;">${escapeHTML(evEval.proposed_decision)}</strong>.
                    <div style="font-size:0.77rem; color:#1e3a8a; margin-top:2px;">${escapeHTML(evEval.guidance_message || '')}</div>
                  </div>
                </div>
              ` : ''}

              <!-- Champ Motif obligatoire -->
              <div class="data-form-group" style="margin-bottom:10px;">
                <label for="audit-decision-notes-input" class="data-form-label" style="font-weight:700;">
                  Motif ou justification de la décision <span style="color:#dc2626;">(Obligatoire pour Refus, Correction ou Attente)</span> :
                </label>
                <input type="text" id="audit-decision-notes-input" class="data-input" 
                  value="${escapeHTML(obs.audit_decision_notes || '')}" 
                  placeholder="Ex: Confirmation de la validité de la projection BUCREP post-RGPH 3..." />
              </div>

              <!-- Champ Pièce justificative -->
              <div class="data-form-group" style="margin-bottom:14px;">
                <label for="audit-evidence-input" class="data-form-label" style="font-weight:600;">
                  Pièce justificative (Référence ou URL complémentaire, si applicable) :
                </label>
                <input type="text" id="audit-evidence-input" class="data-input" 
                  value="${escapeHTML(obs.audit_evidence_url || obs.audit_evidence_reference || '')}" 
                  placeholder="Ex: https://ins-cameroun.cm/docs/rapport-rectificatif.pdf ou Référence courrier N°42/INS" />
              </div>

              <!-- 4 Décisions Explicites -->
              <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <button type="button" class="data-btn data-btn-success" onclick="SolitiquoDataAdmin.submitAuditDecision(${obs.id}, 'accepted')" title="Autorise la poursuite vers la validation méthodologique">
                  <i data-lucide="check-circle-2"></i> Accepter l'audit
                </button>
                <button type="button" class="data-btn data-btn-danger" onclick="SolitiquoDataAdmin.submitAuditDecision(${obs.id}, 'rejected')" title="Refuser formellement l'audit avec motif obligatoire">
                  <i data-lucide="x-circle"></i> Refuser l'audit
                </button>
                <button type="button" class="data-btn data-btn-warning" style="background:#f59e0b; color:#fff;" onclick="SolitiquoDataAdmin.submitAuditDecision(${obs.id}, 'correction_requested')" title="Demander une correction et renvoyer en brouillon">
                  <i data-lucide="undo-2"></i> Demander une correction
                </button>
                <button type="button" class="data-btn data-btn-secondary" onclick="SolitiquoDataAdmin.submitAuditDecision(${obs.id}, 'pending_evidence')" title="Maintenir en attente faute de preuve suffisante">
                  <i data-lucide="help-circle"></i> Maintenir en attente
                </button>
              </div>
            </div>
          ` : ''}

          <!-- 8. Formulaire de Transition du Workflow Éditorial -->
          ${isAdmin ? `
            <div class="data-decision-box">
              <h4 style="font-family:'Playfair Display'; margin:0 0 8px; color:#0f172a;">Gouvernance &amp; Décision Méthodologique</h4>
              <p style="font-size:0.84rem; color:#64748b; margin:0 0 12px;">
                Statut actuel de l'observation : <strong>${obs.editorial_status}</strong>. Aucune publication automatique n'est autorisée. La validation méthodologique demeure strictement distincte de la publication.
              </p>
              
              <div class="data-form-group">
                <label for="validation-decision-notes" class="data-form-label">Note méthodologique ou motif d'action</label>
                <input type="text" id="validation-decision-notes" class="data-input" placeholder="Ex: Revue méthodologique conforme aux critères de robustesse INS." />
              </div>

              <div style="display:flex; gap:10px; margin-top:14px; align-items:center; flex-wrap:wrap;">
                ${obs.editorial_status === 'draft' ? `
                  <button type="button" class="data-btn data-btn-primary" onclick="SolitiquoDataAdmin.submitReviewFromValidation(${obs.id})">
                    <i data-lucide="send"></i> Transmettre à la validation méthodologique
                  </button>
                ` : ''}

                ${obs.editorial_status === 'under_review' ? `
                  <button type="button" class="data-btn data-btn-success" onclick="SolitiquoDataAdmin.submitValidationDecision(${obs.id}, true)">
                    <i data-lucide="check"></i> Valider méthodologiquement
                  </button>
                  <button type="button" class="data-btn data-btn-secondary" onclick="SolitiquoDataAdmin.submitCorrectionRequest(${obs.id})">
                    <i data-lucide="undo-2"></i> Demander une correction (retour brouillon)
                  </button>
                  <button type="button" class="data-btn data-btn-danger" onclick="SolitiquoDataAdmin.promptReject(${obs.id})">
                    <i data-lucide="x"></i> Rejeter avec justification
                  </button>
                ` : ''}

                ${obs.editorial_status === 'methodologically_validated' ? `
                  ${obs.publication_eligibility?.can_publish ? `
                    <button type="button" class="data-btn data-btn-success" onclick="SolitiquoDataAdmin.publishFromValidation(${obs.id})">
                      <i data-lucide="globe"></i> Publier formellement l'observation
                    </button>
                  ` : `
                    <button type="button" class="data-btn data-btn-disabled" disabled title="Publication bloquée : conditions préalables non satisfaites (voir diagnostic ci-dessus)" style="opacity:0.6; cursor:not-allowed;">
                      <i data-lucide="lock"></i> Publication bloquée (conditions non remplies)
                    </button>
                  `}
                  <button type="button" class="data-btn data-btn-secondary" onclick="SolitiquoDataAdmin.submitCorrectionRequest(${obs.id})">
                    <i data-lucide="undo-2"></i> Révoquer vers brouillon pour correction
                  </button>
                ` : ''}

                ${obs.editorial_status === 'published' ? `
                  <span style="font-size:0.85rem; font-weight:700; color:#15803d; display:inline-flex; align-items:center; gap:5px;">
                    <i data-lucide="check-circle-2"></i> Observation actuellement publiée active.
                  </span>
                  <button type="button" class="data-btn data-btn-xs data-btn-secondary" onclick="SolitiquoDataAdmin.promptRevise(${obs.id})">
                    <i data-lucide="git-branch"></i> Préparer une révision
                  </button>
                ` : ''}
              </div>
            </div>
          ` : `
            <div style="padding:14px; background:#f1f5f9; border-radius:8px; font-size:0.85rem; color:#475569;">
              <i data-lucide="shield"></i> La prise de décision éditoriale et méthodologique est réservée aux Administrateurs habilités.
            </div>
          `}

          <!-- 9. Historique chronologique des décisions et journal d'audit -->
          <div class="data-card" style="padding:16px;">
            <div style="font-weight:700; font-size:0.88rem; color:#0f172a; margin-bottom:8px;">
              <i data-lucide="history" style="width:16px;height:16px;display:inline;vertical-align:text-bottom;"></i>
              Historique des décisions et journal d'audit (${auditLog.length} événement${auditLog.length > 1 ? 's' : ''}) :
            </div>
            ${auditLog.length === 0 ? `
              <div style="font-size:0.83rem; color:#64748b; font-style:italic;">Aucune trace d'audit enregistrée pour le moment.</div>
            ` : `
              <div class="data-decision-timeline">
                ${auditLog.map(al => `
                  <div class="data-timeline-item">
                    <div class="data-timeline-dot ${['VALIDATE_METHODOLOGY', 'PUBLISH'].includes(al.action) ? 'active' : ''}">
                      <i data-lucide="${al.action === 'VALIDATE_METHODOLOGY' ? 'check' : (al.action === 'PUBLISH' ? 'globe' : (al.action === 'REJECT' ? 'x' : 'clock'))}" style="width:12px;height:12px;"></i>
                    </div>
                    <div class="data-timeline-content">
                      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2px;">
                        <strong style="font-size:0.84rem; color:#0f172a;">${escapeHTML(al.action)}</strong>
                        <span style="font-size:0.75rem; color:#64748b;">${formatDate(al.performed_at)}</span>
                      </div>
                      <div style="font-size:0.8rem; color:#475569;">
                        Effectué par : <strong>${escapeHTML(al.performed_by_username || 'Système')}</strong>
                        ${al.old_status && al.new_status ? ` &bull; Transition : <code>${escapeHTML(al.old_status)}</code> &rarr; <code>${escapeHTML(al.new_status)}</code>` : ''}
                      </div>
                      ${al.reason ? `
                        <div style="font-size:0.8rem; color:#334155; margin-top:4px; font-style:italic; background:#fff; padding:4px 8px; border-radius:4px; border:1px solid #e2e8f0;">
                          ${escapeHTML(al.reason)}
                        </div>
                      ` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;

      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
    } catch (e) {
      console.error('Erreur chargement dossier validation:', e);
      if (dossierBox) dossierBox.innerHTML = `<div class="data-empty-state" style="color:#dc2626;">Erreur : ${escapeHTML(e.message)}</div>`;
    }
  }

  async function submitValidationDecision(id, approved) {
    if (!approved) return;
    const notesInput = document.getElementById('validation-decision-notes');
    const notes = notesInput ? notesInput.value.trim() : 'Validation méthodologique conforme aux critères de robustesse documentaire.';

    try {
      await DataAdminAPI.validateMethodology(id, notes);
      toast('success', 'Observation validée méthodologiquement avec succès !');
      loadValidationQueue();
      selectValidationObservation(id);
      loadDashboard();
    } catch (e) {
      console.error('Erreur validation méthodologique:', e);
      toast('error', e.message || 'Impossible de valider cette observation.');
    }
  }

  async function submitAuditDecision(id, decision, forcedNotes = null, forcedEvidenceUrl = null, forcedEvidenceRef = null) {
    const inputNotes = document.getElementById('audit-decision-notes-input');
    const inputEvidence = document.getElementById('audit-evidence-input');
    let notes = (forcedNotes !== null ? forcedNotes : (inputNotes ? inputNotes.value : '')).trim();
    let evidence = (forcedEvidenceUrl !== null ? forcedEvidenceUrl : (inputEvidence ? inputEvidence.value : '')).trim();

    // Vérifier les motifs obligatoires pour Refus, Correction, ou Attente de preuve
    const labels = {
      accepted: "Accepter l'audit",
      rejected: "Refuser l'audit",
      correction_requested: "Demander une correction",
      pending_evidence: "Maintenir en attente faute de preuve"
    };

    if (decision !== 'accepted' && (!notes || notes.length < 5)) {
      if (window.Swal) {
        const { value: promptResult } = await window.Swal.fire({
          title: `${labels[decision] || 'Décision'}`,
          input: 'textarea',
          inputLabel: 'Un motif obligatoire (au moins 5 caractères) est requis :',
          inputPlaceholder: 'Indiquez le motif précis de la décision...',
          showCancelButton: true,
          confirmButtonText: 'Confirmer la décision',
          cancelButtonText: 'Annuler',
          inputValidator: (val) => {
            if (!val || val.trim().length < 5) {
              return 'Le motif est obligatoire et doit comporter au moins 5 caractères.';
            }
          }
        });
        if (!promptResult) return;
        notes = promptResult.trim();
      } else {
        const promptResult = prompt(`Motif obligatoire requis pour "${labels[decision]}" :`);
        if (!promptResult || promptResult.trim().length < 5) {
          toast('warning', 'Opération annulée : motif obligatoire manquant.');
          return;
        }
        notes = promptResult.trim();
      }
    }

    try {
      const evidenceUrl = evidence.startsWith('http') ? evidence : null;
      const evidenceRef = evidence.startsWith('http') ? null : (evidence || null);

      await DataAdminAPI.decideAudit(id, decision, notes, evidenceUrl, evidenceRef);
      
      const successMsgs = {
        accepted: 'Audit accepté avec succès : observation autorisée pour validation.',
        rejected: 'Audit refusé formellement. Motif obligatoire consigné.',
        correction_requested: 'Correction demandée : observation renvoyée au statut brouillon.',
        pending_evidence: 'Observation maintenue en attente : demande de preuve enregistrée.'
      };

      toast('success', successMsgs[decision] || 'Décision enregistrée avec succès.');
      loadValidationQueue();
      selectValidationObservation(id);
      loadDashboard();
    } catch (e) {
      console.error('Erreur décision audit:', e);
      toast('error', e.message || 'Impossible d\'enregistrer la décision.');
    }
  }

  async function promptRequestEvidence(id, sourceLabel) {
    if (window.Swal) {
      const { value: formValues } = await window.Swal.fire({
        title: 'Demander une pièce justificative',
        html: `
          <p style="font-size:0.85rem; color:#475569; margin-bottom:10px;">
            Source concernée : <strong>${escapeHTML(sourceLabel)}</strong><br>
            L'observation sera maintenue en attente tant que la preuve documentaire originale n'est pas fournie.
          </p>
          <div style="text-align:left; margin-bottom:8px;">
            <label style="font-size:0.78rem; font-weight:700;">Motif de la demande (Obligatoire) :</label>
            <textarea id="swal-evidence-reason" class="swal2-textarea" style="margin:4px 0 10px; width:100%; box-sizing:border-box;" placeholder="Ex: Absence de lien PDF pour le tableau 4.1 de l'annuaire 2023..."></textarea>
          </div>
          <div style="text-align:left;">
            <label style="font-size:0.78rem; font-weight:700;">Référence ou URL de la pièce attendue (Optionnel) :</label>
            <input id="swal-evidence-ref" class="swal2-input" style="margin:4px 0; width:100%; box-sizing:border-box;" placeholder="Ex: URL MINEDUB ou cote d'archive" />
          </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Enregistrer la demande de pièce',
        cancelButtonText: 'Annuler',
        preConfirm: () => {
          const reason = document.getElementById('swal-evidence-reason')?.value?.trim();
          const ref = document.getElementById('swal-evidence-ref')?.value?.trim();
          if (!reason || reason.length < 5) {
            window.Swal.showValidationMessage('Le motif de la demande est obligatoire (au moins 5 caractères).');
            return false;
          }
          return { reason, ref };
        }
      });
      if (!formValues) return;
      await submitAuditDecision(id, 'pending_evidence', formValues.reason, formValues.ref, formValues.ref);
    } else {
      const reason = prompt(`Demande de pièce justificative pour ${sourceLabel} (motif obligatoire) :`);
      if (!reason || reason.trim().length < 5) return;
      const ref = prompt('Référence ou URL de la pièce attendue (optionnel) :') || '';
      await submitAuditDecision(id, 'pending_evidence', reason.trim(), ref.trim(), ref.trim());
    }
  }

  async function submitCorrectionRequest(id) {
    const notesInput = document.getElementById('validation-decision-notes');
    let notes = notesInput ? notesInput.value.trim() : '';

    if (!notes && window.Swal) {
      const { value: promptNotes } = await window.Swal.fire({
        title: 'Demander une correction',
        input: 'textarea',
        inputLabel: 'Précisez les corrections méthodologiques ou documentaires requises :',
        inputPlaceholder: 'Ex: Vérifier la référence du tableau de l\'annuaire...',
        showCancelButton: true,
        confirmButtonText: 'Demander la correction',
        cancelButtonText: 'Annuler'
      });
      if (!promptNotes) return;
      notes = promptNotes.trim();
    } else if (!notes) {
      notes = prompt('Précisez les corrections méthodologiques ou documentaires requises :');
      if (!notes) return;
    }

    try {
      await DataAdminAPI.requestCorrection(id, notes);
      toast('success', 'Observation renvoyée au statut brouillon avec demande de correction !');
      loadValidationQueue();
      selectValidationObservation(id);
    } catch (e) {
      console.error('Erreur demande de correction:', e);
      toast('error', e.message || 'Impossible de demander la correction.');
    }
  }

  async function submitReviewFromValidation(id) {
    try {
      await DataAdminAPI.submitForReview(id);
      toast('success', 'Observation soumise à la validation méthodologique avec succès !');
      loadValidationQueue();
      selectValidationObservation(id);
    } catch (e) {
      console.error('Erreur soumission validation:', e);
      toast('error', e.message || 'Impossible de soumettre cette observation.');
    }
  }

  async function publishFromValidation(id) {
    if (window.Swal) {
      const { value: summary } = await window.Swal.fire({
        title: 'Publication officielle',
        text: 'La validation méthodologique est distincte de la publication. Saisissez le résumé public de validation :',
        input: 'text',
        inputValue: 'Donnée statistique consolidée et auditée conforme.',
        showCancelButton: true,
        confirmButtonText: 'Confirmer la publication',
        cancelButtonText: 'Annuler'
      });
      if (summary === undefined) return;
      try {
        await DataAdminAPI.publishObservation(id, summary.trim());
        toast('success', 'Observation publiée avec succès sur le portail public !');
        loadValidationQueue();
        selectValidationObservation(id);
        loadDashboard();
      } catch (e) {
        toast('error', e.message || 'Erreur lors de la publication.');
      }
    } else {
      const summary = prompt('Résumé public de publication :', 'Donnée statistique consolidée et auditée.');
      if (summary === null) return;
      try {
        await DataAdminAPI.publishObservation(id, summary);
        toast('success', 'Observation publiée avec succès !');
        loadValidationQueue();
        selectValidationObservation(id);
        loadDashboard();
      } catch (e) {
        toast('error', e.message || 'Erreur lors de la publication.');
      }
    }
  }

  function openValidationDossier(id) {
    switchDataTab('validation');
    selectValidationObservation(id);
  }

  function bindValidationEvents() {
    const searchInput = document.getElementById('val-search-input');
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.dataset.bound = 'true';
      searchInput.addEventListener('input', (e) => {
        filterValidationQueue(e.target.value);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 9. VUE 5 : PUBLICATIONS ($R_n$, RÉVISIONS, RÉVOCATIONS)
  // ---------------------------------------------------------------------------
  async function loadPublications() {
    const tbody = document.getElementById('data-publications-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="data-empty-state"><i data-lucide="loader" class="spin"></i> Chargement des publications...</td></tr>';
    if (window.lucide) window.lucide.createIcons();

    try {
      const q = new URLSearchParams();
      q.set('editorial_status', 'published');
      q.set('limit', '50');
      if (State.excludeTests) q.set('exclude_tests', 'true');

      const res = await DataAdminAPI.getObservations('?' + q.toString());
      const items = res.data || [];

      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="data-empty-state">Aucune observation publiée active actuellement.</td></tr>';
        return;
      }

      const isAdmin = State.currentUser?.role === 'admin';

      tbody.innerHTML = items.map(obs => `
        <tr>
          <td>
            <span class="data-tag-revision">R${obs.revision_number || 1}</span>
            <strong>${escapeHTML(obs.indicator_name)}</strong>
            <div style="font-size:0.75rem; color:#64748b;">${escapeHTML(obs.indicator_code)}</div>
          </td>
          <td><span class="data-tag-territory">${escapeHTML(obs.territory_code)}</span> ${escapeHTML(obs.territory_name || '')}</td>
          <td>${formatDate(obs.period_start)} ➔ ${formatDate(obs.period_end)}</td>
          <td>
            <strong>${obs.value_numeric !== null ? formatNumber(obs.value_numeric) : (obs.value_text || obs.missing_reason)}</strong>
            <span style="font-size:0.75rem; color:#64748b;">${escapeHTML(obs.indicator_unit || '')}</span>
          </td>
          <td>
            <div>${formatDate(obs.published_at)}</div>
            <div style="font-size:0.75rem; color:#64748b;">Par ${escapeHTML(obs.published_by_username || 'Admin')}</div>
          </td>
          <td style="text-align:right; white-space:nowrap;">
            <a href="/data.html?indicator=${encodeURIComponent(obs.indicator_code)}" target="_blank" class="data-btn data-btn-xs data-btn-secondary" title="Voir sur le portail public">
              <i data-lucide="external-link"></i> Public
            </a>
            <button type="button" class="data-btn data-btn-xs data-btn-secondary" onclick="SolitiquoDataAdmin.openDetailView(${obs.id})" title="Fiche détaillée">
              <i data-lucide="eye"></i>
            </button>
            <button type="button" class="data-btn data-btn-xs data-btn-secondary" onclick="SolitiquoDataAdmin.promptRevise(${obs.id})" title="Préparer révision R(n+1)">
              <i data-lucide="git-branch"></i> Réviser
            </button>
            ${isAdmin ? `
              <button type="button" class="data-btn data-btn-xs data-btn-danger" onclick="SolitiquoDataAdmin.promptRevoke(${obs.id})" title="Révoquer publiquement">
                <i data-lucide="alert-octagon"></i>
              </button>
            ` : ''}
          </td>
        </tr>
      `).join('');

      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
    } catch (e) {
      console.error('Erreur chargement publications:', e);
      tbody.innerHTML = `<tr><td colspan="6" class="data-empty-state" style="color:#dc2626;">Erreur : ${escapeHTML(e.message)}</td></tr>`;
    }
  }

  // ---------------------------------------------------------------------------
  // 10. VUE 6 : ESPACE DOCUMENTAIRE & CORPUS DES PUBLICATIONS (LOT 3B)
  // ---------------------------------------------------------------------------
  const DOC_STATUS_META = {
    verified_consulted: { label: 'Consulté & vérifié', class: 'published', bg: '#dcfce7', color: '#15803d', border: '#bbf7d0', icon: 'check-circle-2' },
    identified_unconsulted: { label: 'Identifié non consulté', class: 'under_review', bg: '#fef3c7', color: '#b45309', border: '#fde68a', icon: 'clock' },
    potential_to_search: { label: 'À rechercher', class: 'draft', bg: '#e0f2fe', color: '#0369a1', border: '#bae6fd', icon: 'search' },
    unavailable_or_broken: { label: 'Indisponible / Lien rompu', class: 'revoked', bg: '#fee2e2', color: '#b91c1c', border: '#fecaca', icon: 'alert-triangle' }
  };

  const DOC_CATEGORY_LABELS = {
    census: 'Recensement (RGPH)',
    survey: 'Enquête nationale',
    national_accounts: 'Comptes nationaux & PIB',
    budget_law: 'Loi de finances & Budget',
    statistical_yearbook: 'Annuaire statistique',
    administrative_report: 'Rapport administratif',
    periodic_bulletin: 'Bulletin périodique',
    demographic_projection: 'Projections démographiques',
    electoral_decision: 'Décision / Rapport électoral',
    academic_study: 'Étude académique',
    international_database: 'Base internationale'
  };

  async function loadSourcesDirectory() {
    const pubTbody = document.getElementById('doc-publications-tbody');
    const uncTbody = document.getElementById('doc-uncovered-tbody');
    const grid = document.getElementById('data-sources-grid');

    if (pubTbody) pubTbody.innerHTML = '<tr><td colspan="7" class="data-empty-state"><i data-lucide="loader" class="spin"></i> Chargement du corpus documentaire...</td></tr>';
    if (window.lucide) window.lucide.createIcons();

    try {
      const [statsRes, pubsRes, uncRes, srcStatsRes] = await Promise.all([
        DataAdminAPI.getDocumentaryStats(),
        DataAdminAPI.getDocumentaryPublications(),
        DataAdminAPI.getUncoveredIndicators(),
        DataAdminAPI.getSourcesStats()
      ]);

      State.documentary.stats = statsRes.data || {};
      State.documentary.publications = pubsRes.data || [];
      State.documentary.uncoveredIndicators = uncRes.data || [];
      State.documentary.institutions = srcStatsRes.data || [];

      // Mettre à jour les métriques chiffrées
      const pStats = State.documentary.stats.publications || {};
      const iStats = State.documentary.stats.indicators || {};

      const elTotal = document.getElementById('doc-stat-total');
      const elVerified = document.getElementById('doc-stat-verified');
      const elCovered = document.getElementById('doc-stat-covered');
      const elUncovered = document.getElementById('doc-stat-uncovered');
      const elRate = document.getElementById('doc-stat-rate');

      if (elTotal) elTotal.textContent = pStats.total_publications || State.documentary.publications.length;
      if (elVerified) elVerified.textContent = pStats.verified_consulted || 0;
      if (elCovered) elCovered.textContent = iStats.verified_covered || 0;
      if (elUncovered) elUncovered.textContent = State.documentary.uncoveredIndicators.length;
      if (elRate) elRate.textContent = `${iStats.coverage_rate_percent || 0}%`;

      // Mettre à jour les compteurs des sous-onglets
      const tabPub = document.getElementById('doc-tab-count-pub');
      const tabUnc = document.getElementById('doc-tab-count-uncovered');
      const tabInst = document.getElementById('doc-tab-count-inst');

      if (tabPub) tabPub.textContent = State.documentary.publications.length;
      if (tabUnc) tabUnc.textContent = State.documentary.uncoveredIndicators.length;
      if (tabInst) tabInst.textContent = State.documentary.institutions.length;

      // Alimenter le filtre des institutions
      populateDocInstitutionFilter();

      // Rendre les 3 vues
      renderDocumentaryPublicationsTable();
      renderUncoveredIndicatorsTable();
      renderInstitutionsGrid();

      // Binder les événements de filtrage documentaire
      bindDocFilterEvents();

    } catch (e) {
      console.error('Erreur chargement espace documentaire:', e);
      if (pubTbody) pubTbody.innerHTML = `<tr><td colspan="7" class="data-empty-state" style="color:#dc2626;">Erreur : ${escapeHTML(e.message)}</td></tr>`;
    }
  }

  function populateDocInstitutionFilter() {
    const sel = document.getElementById('doc-filter-institution');
    if (!sel) return;

    const current = sel.value;
    const sources = State.referentials.sources || [];
    sel.innerHTML = '<option value="">Toutes les institutions</option>' +
      sources.map(s => `<option value="${s.id}">${escapeHTML(s.acronym ? s.acronym + ' — ' + s.name : s.name)}</option>`).join('');

    if (current) sel.value = current;
  }

  function bindDocFilterEvents() {
    const sInput = document.getElementById('doc-filter-search');
    const iSelect = document.getElementById('doc-filter-institution');
    const cSelect = document.getElementById('doc-filter-category');
    const stSelect = document.getElementById('doc-filter-status');

    const onChange = () => {
      State.documentary.filters.search = sInput ? sInput.value.trim().toLowerCase() : '';
      State.documentary.filters.institution_id = iSelect ? iSelect.value : '';
      State.documentary.filters.category = cSelect ? cSelect.value : '';
      State.documentary.filters.verification_status = stSelect ? stSelect.value : '';
      renderDocumentaryPublicationsTable();
    };

    if (sInput && !sInput._bound) {
      sInput.addEventListener('input', onChange);
      sInput._bound = true;
    }
    if (iSelect && !iSelect._bound) {
      iSelect.addEventListener('change', onChange);
      iSelect._bound = true;
    }
    if (cSelect && !cSelect._bound) {
      cSelect.addEventListener('change', onChange);
      cSelect._bound = true;
    }
    if (stSelect && !stSelect._bound) {
      stSelect.addEventListener('change', onChange);
      stSelect._bound = true;
    }
  }

  function resetDocFilters() {
    State.documentary.filters = { search: '', institution_id: '', category: '', verification_status: '' };
    const sInput = document.getElementById('doc-filter-search');
    const iSelect = document.getElementById('doc-filter-institution');
    const cSelect = document.getElementById('doc-filter-category');
    const stSelect = document.getElementById('doc-filter-status');

    if (sInput) sInput.value = '';
    if (iSelect) iSelect.value = '';
    if (cSelect) cSelect.value = '';
    if (stSelect) stSelect.value = '';

    renderDocumentaryPublicationsTable();
  }

  function renderDocumentaryPublicationsTable() {
    const tbody = document.getElementById('doc-publications-tbody');
    if (!tbody) return;

    let items = State.documentary.publications || [];
    const f = State.documentary.filters;

    if (f.institution_id) {
      items = items.filter(p => String(p.institution_id) === String(f.institution_id));
    }
    if (f.category) {
      items = items.filter(p => p.document_category === f.category);
    }
    if (f.verification_status) {
      items = items.filter(p => p.verification_status === f.verification_status);
    }
    if (f.search) {
      items = items.filter(p =>
        (p.title && p.title.toLowerCase().includes(f.search)) ||
        (p.institution_acronym && p.institution_acronym.toLowerCase().includes(f.search)) ||
        (p.institution_name && p.institution_name.toLowerCase().includes(f.search)) ||
        (p.bibliographic_reference && p.bibliographic_reference.toLowerCase().includes(f.search)) ||
        (p.notes && p.notes.toLowerCase().includes(f.search))
      );
    }

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="data-empty-state">Aucune publication ne correspond aux critères de recherche.</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(p => {
      const meta = DOC_STATUS_META[p.verification_status] || { label: p.verification_status, bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', icon: 'help-circle' };
      const catLabel = DOC_CATEGORY_LABELS[p.document_category] || p.document_category;
      const indCount = (p.indicators && Array.isArray(p.indicators)) ? p.indicators.length : 0;

      const indicatorsSummary = indCount > 0
        ? `<div style="display:flex; flex-wrap:wrap; gap:4px; max-width:240px;">` +
            p.indicators.slice(0, 3).map(i => `<span class="data-tag-territory" style="font-size:0.7rem;" title="${escapeHTML(i.name || '')}">${escapeHTML(i.code)}</span>`).join('') +
            (indCount > 3 ? `<span class="data-pill-btn" style="font-size:0.7rem;">+${indCount - 3}</span>` : '') +
          `</div>`
        : `<span style="font-size:0.8rem; color:#94a3b8; font-style:italic;">Aucun indicateur</span>`;

      return `
        <tr>
          <td>
            <div style="font-weight:600; color:#0f172a; max-width:280px; line-height:1.35;">${escapeHTML(p.title)}</div>
            <div style="font-size:0.75rem; color:#64748b; margin-top:3px;">
              <span class="data-category-badge" style="font-size:0.7rem;">${escapeHTML(catLabel)}</span>
              ${p.documentary_tier ? `<span style="margin-left:6px; font-weight:600;">${escapeHTML(p.documentary_tier.replace('_', ' '))}</span>` : ''}
            </div>
          </td>
          <td>
            <strong style="color:#0f172a;">${escapeHTML(p.institution_acronym || p.institution_name)}</strong>
            ${p.publisher_organization && p.publisher_organization !== p.institution_name ? `<div style="font-size:0.75rem; color:#64748b;">Diff: ${escapeHTML(p.publisher_organization)}</div>` : ''}
          </td>
          <td>
            <div><strong>${p.publication_year || '—'}</strong></div>
            ${p.coverage_period_start ? `<div style="font-size:0.75rem; color:#64748b;">${formatDate(p.coverage_period_start)} ➔ ${formatDate(p.coverage_period_end)}</div>` : ''}
          </td>
          <td>
            <span class="status-badge" style="background:${meta.bg}; color:${meta.color}; border:1px solid ${meta.border}; font-size:0.75rem; padding:3px 8px;">
              <i data-lucide="${meta.icon}" style="width:13px; height:13px;"></i> ${escapeHTML(meta.label)}
            </span>
            ${p.consultation_date ? `<div style="font-size:0.7rem; color:#64748b; margin-top:3px;">Consulté le ${formatDate(p.consultation_date)}</div>` : ''}
          </td>
          <td>${indicatorsSummary}</td>
          <td>
            ${p.url ? `
              <div>
                <a href="${escapeHTML(p.url)}" target="_blank" class="data-btn data-btn-xs data-btn-outline" style="font-size:0.75rem; padding:2px 6px;">
                  <i data-lucide="external-link"></i> Notice / PDF
                </a>
              </div>
            ` : ''}
            ${p.bibliographic_reference ? `<div style="font-size:0.75rem; color:#64748b; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHTML(p.bibliographic_reference)}">${escapeHTML(p.bibliographic_reference)}</div>` : ''}
          </td>
          <td style="text-align:right; white-space:nowrap;">
            <button type="button" class="data-btn data-btn-xs data-btn-secondary" onclick="SolitiquoDataAdmin.viewPublicationDetails(${p.id})" title="Consulter la fiche détaillée">
              <i data-lucide="eye"></i>
            </button>
            <button type="button" class="data-btn data-btn-xs data-btn-secondary" onclick="SolitiquoDataAdmin.openPublicationModal(${p.id})" title="Modifier la publication">
              <i data-lucide="edit-2"></i>
            </button>
            <button type="button" class="data-btn data-btn-xs data-btn-danger" onclick="SolitiquoDataAdmin.deletePublication(${p.id})" title="Supprimer de la base">
              <i data-lucide="trash-2"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  function renderUncoveredIndicatorsTable() {
    const tbody = document.getElementById('doc-uncovered-tbody');
    if (!tbody) return;

    const list = State.documentary.uncoveredIndicators || [];
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="data-empty-state" style="color:#16a34a;"><i data-lucide="check-circle" style="color:#16a34a; width:24px; height:24px;"></i><br/>Excellente couverture ! Tous les indicateurs actifs sont reliés à une publication vérifiée.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map(ind => {
      const partials = ind.partial_publications || [];
      const partialsInfo = partials.length > 0
        ? `<div style="font-size:0.8rem; color:#b45309;">
            ${partials.length} publication(s) en attente de vérification:
            <ul style="margin:2px 0 0 16px; padding:0;">
              ${partials.map(p => `<li>${escapeHTML(p.title)} (${p.publication_year || '—'})</li>`).join('')}
            </ul>
           </div>`
        : `<span style="font-size:0.8rem; color:#dc2626; font-style:italic;">Aucune publication identifiée</span>`;

      return `
        <tr>
          <td>
            <strong>${escapeHTML(ind.name)}</strong>
            <div style="font-size:0.75rem; color:#64748b;"><code>${escapeHTML(ind.code)}</code></div>
          </td>
          <td><span class="data-category-badge">${escapeHTML(ind.category || '—')}</span></td>
          <td><span style="font-size:0.85rem; color:#475569;">${escapeHTML(ind.subdomain || '—')}</span></td>
          <td><strong>${escapeHTML(ind.unit || '—')}</strong></td>
          <td><span class="data-tag-territory">${escapeHTML(ind.producer_institution || 'INS')}</span></td>
          <td>${partialsInfo}</td>
          <td style="text-align:right;">
            <button type="button" class="data-btn data-btn-xs data-btn-primary" onclick="SolitiquoDataAdmin.openPublicationModal(null, ${ind.id})" title="Associer une nouvelle publication à cet indicateur">
              <i data-lucide="plus"></i> Documenter
            </button>
          </td>
        </tr>
      `;
    }).join('');

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  function renderInstitutionsGrid() {
    const grid = document.getElementById('data-sources-grid');
    if (!grid) return;

    const sources = State.documentary.institutions || [];
    if (sources.length === 0) {
      grid.innerHTML = '<div class="data-empty-state">Aucune source documentaire répertoriée.</div>';
      return;
    }

    grid.innerHTML = sources.map(s => `
      <div class="data-source-card">
        <div>
          <div class="data-source-header">
            <span class="data-source-acronym">${escapeHTML(s.acronym || 'SRC')}</span>
            <span class="data-pill-btn" style="text-transform:uppercase;">${escapeHTML(s.institution_type)}</span>
          </div>
          <h4 class="data-source-name">${escapeHTML(s.name)}</h4>
          <p class="data-source-desc">${escapeHTML(s.description || 'Institution officielle de référence statistique.')}</p>
        </div>
        <div>
          <div class="data-source-stats-row">
            <div><strong style="color:#37463D;">${s.observations_count || 0}</strong> observation(s)</div>
            <div><strong style="color:#C82823;">${s.indicators_count || 0}</strong> indicateur(s)</div>
          </div>
          ${s.website_url ? `
            <div style="margin-top:10px;">
              <a href="${escapeHTML(s.website_url)}" target="_blank" class="data-btn data-btn-xs data-btn-secondary" style="width:100%;">
                <i data-lucide="external-link"></i> Site officiel institutionnel
              </a>
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  function switchDocumentarySubTab(tab) {
    State.documentary.activeSubTab = tab;

    const btnPub = document.getElementById('subtab-btn-publications');
    const btnUnc = document.getElementById('subtab-btn-uncovered');
    const btnInst = document.getElementById('subtab-btn-institutions');

    if (btnPub) btnPub.classList.toggle('active', tab === 'publications');
    if (btnUnc) btnUnc.classList.toggle('active', tab === 'uncovered');
    if (btnInst) btnInst.classList.toggle('active', tab === 'institutions');

    const panelPub = document.getElementById('doc-panel-publications');
    const panelUnc = document.getElementById('doc-panel-uncovered');
    const panelInst = document.getElementById('doc-panel-institutions');

    if (panelPub) panelPub.style.display = tab === 'publications' ? 'block' : 'none';
    if (panelUnc) panelUnc.style.display = tab === 'uncovered' ? 'block' : 'none';
    if (panelInst) panelInst.style.display = tab === 'institutions' ? 'block' : 'none';

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  // ---------------------------------------------------------------------------
  // GESTION DU MODAL DE PUBLICATION (AJOUT / MODIFICATION / CONSULTATION)
  // ---------------------------------------------------------------------------
  async function openPublicationModal(pubId = null, preselectedIndicatorId = null) {
    const modal = document.getElementById('modal-publication-edit');
    if (!modal) return;

    // Remplir la liste des institutions dans le modal
    const instSelect = document.getElementById('pub-form-institution');
    if (instSelect) {
      instSelect.innerHTML = '<option value="">Sélectionnez l\'institution...</option>' +
        (State.referentials.sources || []).map(s => `
          <option value="${s.id}">${escapeHTML(s.acronym ? s.acronym + ' — ' + s.name : s.name)}</option>
        `).join('');
    }

    let pub = null;
    let selectedIndIds = new Set();
    if (preselectedIndicatorId) selectedIndIds.add(preselectedIndicatorId);

    if (pubId) {
      try {
        const res = await DataAdminAPI.getDocumentaryPublication(pubId);
        pub = res.data;
        if (pub && pub.indicators) {
          pub.indicators.forEach(i => selectedIndIds.add(i.id));
        }
      } catch (err) {
        toast('error', 'Impossible de charger la publication: ' + err.message);
        return;
      }
    }

    // Titre de la modale
    const titleEl = document.getElementById('modal-pub-title');
    if (titleEl) {
      titleEl.textContent = pubId ? `Modifier la publication #${pubId}` : 'Nouvelle publication statistique';
    }

    // Alimenter les champs
    document.getElementById('pub-form-id').value = pubId || '';
    document.getElementById('pub-form-title').value = pub?.title || '';
    document.getElementById('pub-form-institution').value = pub?.institution_id || '';
    document.getElementById('pub-form-publisher').value = pub?.publisher_organization || '';
    document.getElementById('pub-form-category').value = pub?.document_category || 'statistical_yearbook';
    document.getElementById('pub-form-status').value = pub?.verification_status || 'verified_consulted';
    document.getElementById('pub-form-year').value = pub?.publication_year || new Date().getFullYear();
    document.getElementById('pub-form-period-start').value = pub?.coverage_period_start ? pub.coverage_period_start.slice(0, 10) : '';
    document.getElementById('pub-form-period-end').value = pub?.coverage_period_end ? pub.coverage_period_end.slice(0, 10) : '';
    document.getElementById('pub-form-tier').value = pub?.documentary_tier || 'TIER_2_STATISTICAL';
    document.getElementById('pub-form-url').value = pub?.url || '';
    document.getElementById('pub-form-consult-date').value = pub?.consultation_date ? pub.consultation_date.slice(0, 10) : new Date().toISOString().slice(0, 10);
    document.getElementById('pub-form-geo').value = pub?.geographical_coverage || 'Cameroun (National)';
    document.getElementById('pub-form-biblio').value = pub?.bibliographic_reference || '';
    document.getElementById('pub-form-notes').value = pub?.notes || '';

    // Liste des indicateurs à cocher
    renderPublicationIndicatorsPicker(selectedIndIds);

    modal.style.display = 'flex';
    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  function renderPublicationIndicatorsPicker(selectedIndIds) {
    const container = document.getElementById('pub-form-indicators-list');
    const countBadge = document.getElementById('pub-form-indicators-count');
    if (!container) return;

    const indicators = State.excludeTests
      ? (State.referentials.indicators || []).filter(i => !i.code.startsWith('IND_'))
      : (State.referentials.indicators || []);

    if (countBadge) countBadge.textContent = selectedIndIds.size;

    container.innerHTML = indicators.map(ind => {
      const isChecked = selectedIndIds.has(ind.id);
      return `
        <label style="display:flex; align-items:flex-start; gap:8px; font-size:0.8rem; cursor:pointer; padding:4px 6px; border-radius:4px; background:${isChecked ? '#eff6ff' : 'transparent'};">
          <input type="checkbox" class="pub-indicator-cb" value="${ind.id}" ${isChecked ? 'checked' : ''} onchange="SolitiquoDataAdmin.updatePublicationIndicatorsCount()" style="margin-top:2px;" />
          <div>
            <strong>${escapeHTML(ind.code)}</strong>
            <div style="font-size:0.75rem; color:#64748b; line-height:1.2;">${escapeHTML(ind.name)}</div>
          </div>
        </label>
      `;
    }).join('');
  }

  function updatePublicationIndicatorsCount() {
    const checked = document.querySelectorAll('.pub-indicator-cb:checked');
    const countBadge = document.getElementById('pub-form-indicators-count');
    if (countBadge) countBadge.textContent = checked.length;
  }

  function closePublicationModal() {
    const modal = document.getElementById('modal-publication-edit');
    if (modal) modal.style.display = 'none';
  }

  async function savePublication() {
    const pubId = document.getElementById('pub-form-id').value;
    const title = document.getElementById('pub-form-title').value.trim();
    const instId = parseInt(document.getElementById('pub-form-institution').value, 10);
    const publisher = document.getElementById('pub-form-publisher').value.trim();
    const category = document.getElementById('pub-form-category').value;
    const status = document.getElementById('pub-form-status').value;
    const yearVal = document.getElementById('pub-form-year').value;
    const periodStart = document.getElementById('pub-form-period-start').value || null;
    const periodEnd = document.getElementById('pub-form-period-end').value || null;
    const tier = document.getElementById('pub-form-tier').value;
    const url = document.getElementById('pub-form-url').value.trim() || null;
    const consultDate = document.getElementById('pub-form-consult-date').value || null;
    const geo = document.getElementById('pub-form-geo').value.trim() || 'Cameroun (National)';
    const biblio = document.getElementById('pub-form-biblio').value.trim() || null;
    const notes = document.getElementById('pub-form-notes').value.trim() || null;

    if (!title) {
      toast('warning', 'Le titre exact de la publication est obligatoire.');
      return;
    }
    if (!instId || isNaN(instId)) {
      toast('warning', 'Veuillez sélectionner l\'institution productrice.');
      return;
    }

    // Récupérer les indicateurs cochés
    const checkedBoxes = document.querySelectorAll('.pub-indicator-cb:checked');
    const indicatorIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value, 10));

    const payload = {
      title,
      institution_id: instId,
      publisher_organization: publisher || null,
      document_category: category,
      verification_status: status,
      publication_year: yearVal ? parseInt(yearVal, 10) : null,
      coverage_period_start: periodStart,
      coverage_period_end: periodEnd,
      documentary_tier: tier,
      url,
      consultation_date: consultDate,
      geographical_coverage: geo,
      bibliographic_reference: biblio,
      notes,
      indicators: indicatorIds
    };

    const btn = document.getElementById('btn-save-publication');
    if (btn) btn.disabled = true;

    try {
      if (pubId) {
        await DataAdminAPI.updateDocumentaryPublication(pubId, payload);
        toast('success', 'Publication modifiée avec succès.');
      } else {
        await DataAdminAPI.createDocumentaryPublication(payload);
        toast('success', 'Nouvelle publication enregistrée avec succès.');
      }
      closePublicationModal();
      await loadSourcesDirectory();
    } catch (err) {
      toast('error', 'Erreur lors de l\'enregistrement : ' + (err.message || 'Erreur serveur'));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function deletePublication(pubId) {
    if (!window.Swal) {
      if (!confirm(`Confirmez-vous la suppression de la publication #${pubId} ?`)) return;
    } else {
      const confirmRes = await window.Swal.fire({
        title: 'Supprimer cette publication ?',
        text: 'Cette action retirera cette référence du corpus documentaire et supprimera ses associations avec les indicateurs.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Oui, supprimer',
        cancelButtonText: 'Annuler'
      });
      if (!confirmRes.isConfirmed) return;
    }

    try {
      await DataAdminAPI.deleteDocumentaryPublication(pubId);
      toast('success', 'Publication supprimée.');
      await loadSourcesDirectory();
    } catch (err) {
      toast('error', 'Erreur lors de la suppression : ' + (err.message || 'Erreur serveur'));
    }
  }

  function testPublicationUrl() {
    const urlInput = document.getElementById('pub-form-url');
    if (!urlInput || !urlInput.value.trim()) {
      toast('info', 'Aucune URL saisie à tester.');
      return;
    }
    const val = urlInput.value.trim();
    if (!val.startsWith('http://') && !val.startsWith('https://')) {
      toast('warning', 'L\'URL doit débuter par https:// ou http://');
      return;
    }
    window.open(val, '_blank');
  }

  async function viewPublicationDetails(pubId) {
    try {
      const res = await DataAdminAPI.getDocumentaryPublication(pubId);
      const pub = res.data;
      if (!pub) return;

      const meta = DOC_STATUS_META[pub.verification_status] || { label: pub.verification_status, bg: '#f1f5f9', color: '#475569' };
      const catLabel = DOC_CATEGORY_LABELS[pub.document_category] || pub.document_category;
      const indList = pub.indicators || [];

      const indHtml = indList.length > 0
        ? `<div style="max-height:140px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px; padding:8px; background:#f8fafc;">
            ${indList.map(i => `
              <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #f1f5f9; font-size:0.85rem;">
                <div><strong>${escapeHTML(i.code)}</strong> — ${escapeHTML(i.name)}</div>
                ${i.specific_section ? `<span class="data-tag-territory">${escapeHTML(i.specific_section)}</span>` : ''}
              </div>
            `).join('')}
           </div>`
        : '<p style="color:#64748b; font-style:italic;">Aucun indicateur relié pour le moment.</p>';

      if (window.Swal) {
        window.Swal.fire({
          title: `<div style="font-family:'Playfair Display', serif; font-size:1.15rem; color:#0f172a; text-align:left;">${escapeHTML(pub.title)}</div>`,
          html: `
            <div style="text-align:left; font-size:0.9rem; display:flex; flex-direction:column; gap:12px; margin-top:12px;">
              <div style="display:flex; gap:8px; align-items:center;">
                <span class="status-badge" style="background:${meta.bg}; color:${meta.color}; border:1px solid ${meta.border};">
                  ${escapeHTML(meta.label)}
                </span>
                <span class="data-category-badge">${escapeHTML(catLabel)}</span>
                <span style="font-weight:600; color:#475569;">${pub.publication_year || 'Année inconnue'}</span>
              </div>
              <div style="background:#f8fafc; padding:10px; border-radius:6px; border:1px solid #e2e8f0;">
                <div><strong>Institution productrice :</strong> ${escapeHTML(pub.institution_name)} (${escapeHTML(pub.institution_acronym || '')})</div>
                ${pub.publisher_organization ? `<div><strong>Diffuseur :</strong> ${escapeHTML(pub.publisher_organization)}</div>` : ''}
                ${pub.coverage_period_start ? `<div><strong>Période statistique :</strong> ${formatDate(pub.coverage_period_start)} au ${formatDate(pub.coverage_period_end)}</div>` : ''}
                <div><strong>Couverture géographique :</strong> ${escapeHTML(pub.geographical_coverage || 'Cameroun')}</div>
                ${pub.consultation_date ? `<div><strong>Date de consultation :</strong> ${formatDate(pub.consultation_date)}</div>` : ''}
              </div>
              ${pub.url ? `<div><strong>Accès numérique :</strong> <a href="${escapeHTML(pub.url)}" target="_blank" style="color:#C82823; font-weight:600;">Ouvrir la publication ↗</a></div>` : ''}
              ${pub.bibliographic_reference ? `<div><strong>Référence bibliographique :</strong><br/><span style="color:#475569;">${escapeHTML(pub.bibliographic_reference)}</span></div>` : ''}
              ${pub.notes ? `<div><strong>Notes méthodologiques :</strong><br/><span style="color:#475569;">${escapeHTML(pub.notes)}</span></div>` : ''}
              <div>
                <strong>Indicateurs documentés (${indList.length}) :</strong>
                ${indHtml}
              </div>
            </div>
          `,
          width: 650,
          showCloseButton: true,
          showCancelButton: true,
          confirmButtonText: '<i data-lucide="edit-2"></i> Modifier',
          cancelButtonText: 'Fermer',
          confirmButtonColor: '#37463D'
        }).then(result => {
          if (result.isConfirmed) {
            openPublicationModal(pubId);
          }
        });
        setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
      }
    } catch (err) {
      toast('error', 'Erreur : ' + err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // 11. VUE 7 : RÉFÉRENTIELS (INDICATEURS, TERRITOIRES, VENTILATIONS)
  // ---------------------------------------------------------------------------
  function loadReferentials() {
    switchRefTab(State.activeRefTab);
  }

  function switchRefTab(tab) {
    State.activeRefTab = tab;
    document.querySelectorAll('.data-ref-tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.reftab === tab);
    });

    document.querySelectorAll('.data-ref-panel').forEach(p => p.style.display = 'none');
    const target = document.getElementById(`ref-panel-${tab}`);
    if (target) target.style.display = 'block';

    if (tab === 'indicators') renderRefIndicators();
    if (tab === 'territories') renderRefTerritories();
    if (tab === 'breakdowns') renderRefBreakdowns();

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  function renderRefIndicators() {
    const tbody = document.getElementById('ref-indicators-tbody');
    if (!tbody) return;

    const list = State.excludeTests
      ? State.referentials.indicators.filter(i => !i.code.startsWith('IND_') && !i.name.startsWith('Indicateur '))
      : State.referentials.indicators;

    tbody.innerHTML = list.map(i => `
      <tr>
        <td><code>${escapeHTML(i.code)}</code></td>
        <td><strong>${escapeHTML(i.name)}</strong></td>
        <td><span class="data-category-badge">${escapeHTML(i.category || 'Général')}</span></td>
        <td><strong>${escapeHTML(i.unit || '—')}</strong></td>
        <td style="font-size:0.84rem; color:#475569; max-width:280px;">${escapeHTML(i.description || '—')}</td>
        <td><span class="data-pill-btn" style="color:#15803d;">Actif</span></td>
      </tr>
    `).join('');
  }

  function renderRefTerritories() {
    const tbody = document.getElementById('ref-territories-tbody');
    if (!tbody) return;

    tbody.innerHTML = State.referentials.territories.map(t => `
      <tr>
        <td><code>${escapeHTML(t.code)}</code></td>
        <td><strong>${escapeHTML(t.name)}</strong></td>
        <td><span class="data-tag-territory">${escapeHTML(t.type || 'region')}</span></td>
        <td>${escapeHTML(t.capital || '—')}</td>
      </tr>
    `).join('');
  }

  function renderRefBreakdowns() {
    const tbody = document.getElementById('ref-breakdowns-tbody');
    if (!tbody) return;

    tbody.innerHTML = State.referentials.dimensions.map(d => `
      <tr>
        <td><strong>${escapeHTML(d.label)}</strong> (<code>${escapeHTML(d.code)}</code>)</td>
        <td><span class="data-pill-btn">${escapeHTML(d.type || 'categorical')}</span></td>
        <td>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${(d.items || []).map(it => `<span class="data-tag-territory">${escapeHTML(it.label)}</span>`).join('')}
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ---------------------------------------------------------------------------
  // 12. VUE 8 : HISTORIQUE ET AUDIT GLOBAL
  // ---------------------------------------------------------------------------
  function bindAuditEvents() {
    const actionSelect = document.getElementById('audit-filter-action');
    const idInput = document.getElementById('audit-filter-id');
    const refreshBtn = document.getElementById('btn-refresh-audit');

    const triggerAudit = () => {
      State.auditFilters.page = 1;
      State.auditFilters.action = actionSelect ? actionSelect.value : '';
      State.auditFilters.data_value_id = idInput ? idInput.value.trim() : '';
      loadAuditLog();
    };

    if (actionSelect) actionSelect.addEventListener('change', triggerAudit);
    if (idInput) {
      let debounce;
      idInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(triggerAudit, 350);
      });
    }
    if (refreshBtn) refreshBtn.addEventListener('click', triggerAudit);

    const prevBtn = document.getElementById('data-audit-prev');
    const nextBtn = document.getElementById('data-audit-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (State.auditFilters.page > 1) {
          State.auditFilters.page--;
          loadAuditLog();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (State.auditFilters.page < State.auditPagination.totalPages) {
          State.auditFilters.page++;
          loadAuditLog();
        }
      });
    }
  }

  async function loadAuditLog() {
    const tbody = document.getElementById('data-audit-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="data-empty-state"><i data-lucide="loader" class="spin"></i> Chargement du journal d\'audit...</td></tr>';
    if (window.lucide) window.lucide.createIcons();

    try {
      const q = new URLSearchParams();
      q.set('page', State.auditFilters.page);
      q.set('limit', State.auditFilters.limit);
      if (State.auditFilters.action) q.set('action', State.auditFilters.action);
      if (State.auditFilters.data_value_id) q.set('data_value_id', State.auditFilters.data_value_id);
      if (State.excludeTests) q.set('exclude_tests', 'true');

      const res = await DataAdminAPI.getAuditLog('?' + q.toString());
      const items = res.data || [];
      const meta = res.meta || {};

      State.auditPagination.total = meta.total || items.length;
      State.auditPagination.totalPages = meta.totalPages || 1;
      State.auditPagination.currentPage = meta.page || 1;

      const pageInfo = document.getElementById('data-audit-page-info');
      if (pageInfo) {
        pageInfo.textContent = `Page ${State.auditPagination.currentPage} sur ${State.auditPagination.totalPages} (${State.auditPagination.total} événement${State.auditPagination.total > 1 ? 's' : ''})`;
      }
      const prevBtn = document.getElementById('data-audit-prev');
      const nextBtn = document.getElementById('data-audit-next');
      if (prevBtn) prevBtn.disabled = State.auditPagination.currentPage <= 1;
      if (nextBtn) nextBtn.disabled = State.auditPagination.currentPage >= State.auditPagination.totalPages;

      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="data-empty-state">Aucun enregistrement d\'audit ne correspond aux filtres.</td></tr>';
        return;
      }

      tbody.innerHTML = items.map(a => `
        <tr>
          <td>
            <div>${formatDate(a.performed_at, true)}</div>
            <div style="font-size:0.75rem; color:#64748b;">Événement #${a.id}</div>
          </td>
          <td><strong>${escapeHTML(a.performed_by_username || 'Système')}</strong></td>
          <td><code>${escapeHTML(a.action)}</code></td>
          <td>
            ${a.old_status && a.new_status ? `
              <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem;">
                ${getStatusBadge(a.old_status)} ➔ ${getStatusBadge(a.new_status)}
              </div>
            ` : '—'}
          </td>
          <td>
            <a href="javascript:void(0)" onclick="SolitiquoDataAdmin.openDetailView(${a.data_value_id})" style="color:#C82823; font-weight:700;">
              Obs #${a.data_value_id}
            </a>
            <div style="font-size:0.75rem; color:#64748b;">${escapeHTML(a.indicator_code || '')} (${escapeHTML(a.territory_code || '')})</div>
          </td>
          <td style="font-size:0.84rem; color:#334155; max-width:260px;">
            ${escapeHTML(a.reason || '—')}
          </td>
        </tr>
      `).join('');

      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
    } catch (e) {
      console.error('Erreur chargement audit log:', e);
      tbody.innerHTML = `<tr><td colspan="6" class="data-empty-state" style="color:#dc2626;">Erreur : ${escapeHTML(e.message)}</td></tr>`;
    }
  }

  // ---------------------------------------------------------------------------
  // 13. VUE 9 : FICHE D'OBSERVATION DÉTAILLÉE (PLEINE PAGE)
  // ---------------------------------------------------------------------------
  async function openDetailView(id) {
    switchDataTab('detail');
    const container = document.getElementById('data-observation-detail-container');
    if (!container) return;

    container.innerHTML = '<div class="data-empty-state"><i data-lucide="loader" class="spin"></i> Chargement de la fiche d\'observation...</div>';
    if (window.lucide) window.lucide.createIcons();

    try {
      const [obsRes, histRes] = await Promise.all([
        DataAdminAPI.getObservation(id),
        DataAdminAPI.getObservationHistory(id)
      ]);

      const obs = obsRes.data;
      const history = histRes.data || {};
      const versions = history.versions || [];
      const auditTrail = history.audit_trail || [];

      if (!obs) throw new Error('Observation introuvable.');

      const isAdmin = State.currentUser?.role === 'admin';
      const isOwner = obs.created_by === State.currentUser?.id;

      container.innerHTML = `
        <div class="data-detail-page">
          <!-- Barre de navigation supérieure -->
          <div class="data-detail-top-nav">
            <button type="button" class="data-btn data-btn-secondary data-btn-sm" onclick="SolitiquoDataAdmin.returnFromDetail()">
              <i data-lucide="arrow-left"></i> Retour
            </button>
            <div style="display:flex; gap:8px;">
              <span class="data-tag-revision">Révision R${obs.revision_number || 1}</span>
              ${getStatusBadge(obs.editorial_status)}
            </div>
          </div>

          <!-- En-tête monumental -->
          <div class="data-detail-header-card">
            <div>
              <span class="data-category-badge">${escapeHTML(obs.indicator_category || 'Statistique')}</span>
              <h2 style="font-family:'Playfair Display'; font-size:1.85rem; margin:8px 0 6px; color:#0f172a;">
                ${escapeHTML(obs.indicator_name)}
              </h2>
              <div style="font-size:0.92rem; color:#475569;">
                Code officiel : <strong>${escapeHTML(obs.indicator_code)}</strong> | Territoire : <strong>${escapeHTML(obs.territory_name)} (${escapeHTML(obs.territory_code)})</strong>
              </div>
              <div style="font-size:0.85rem; color:#64748b; margin-top:4px;">
                Période : du <strong>${formatDate(obs.period_start)}</strong> au <strong>${formatDate(obs.period_end)}</strong> (${escapeHTML(obs.period_type)})
              </div>
            </div>

            <div class="data-detail-val-display">
              <div class="data-detail-val-num">
                ${obs.value_numeric !== null ? formatNumber(obs.value_numeric) : (obs.value_text || `[${obs.missing_reason}]`)}
              </div>
              <div class="data-detail-val-unit">${escapeHTML(obs.indicator_unit || '')}</div>
            </div>
          </div>

          <!-- Grille des sections méthodologiques et traçabilité -->
          <div class="data-detail-sections-grid">
            <!-- Colonne gauche : Méthodologie, Sources, Ventilations -->
            <div style="display:flex; flex-direction:column; gap:24px;">
              <!-- Carte Méthodologie -->
              <div class="data-card" style="padding:20px;">
                <h4 style="font-family:'Playfair Display'; margin:0 0 10px; color:#0f172a;">Note Méthodologique &amp; Contexte</h4>
                <div style="font-size:0.85rem; color:#64748b; margin-bottom:8px;">
                  Nature méthodologique : <span class="data-pill-btn">${escapeHTML(obs.methodology_nature)}</span>
                </div>
                <p style="font-size:0.9rem; color:#334155; line-height:1.5; margin:0;">
                  ${escapeHTML(obs.methodology_notes || 'Aucune note méthodologique spécifique.')}
                </p>
                ${(isAdmin || isOwner) && obs.internal_notes ? `
                  <div style="margin-top:14px; padding:12px; background:#fffbeb; border:1px solid #fde68a; border-radius:6px; font-size:0.85rem; color:#92400e;">
                    <i data-lucide="lock" style="width:13px;height:13px;"></i> <strong>Notes internes confidentielles :</strong>
                    <div style="margin-top:4px;">${escapeHTML(obs.internal_notes)}</div>
                  </div>
                ` : ''}
              </div>

              <!-- Sources documentaires associées -->
              <div class="data-card">
                <div class="data-card-header">
                  <div class="data-card-title"><i data-lucide="book-open"></i> Sources Documentaires Associées</div>
                  <span class="data-pill-btn">${obs.sources?.length || 0} source(s)</span>
                </div>
                <div class="data-table-wrapper">
                  <table class="data-table data-table-sm">
                    <thead>
                      <tr>
                        <th>Institution</th>
                        <th>Rôle</th>
                        <th>Niveau documentaire (Tier)</th>
                        <th>Référence officielle</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${(obs.sources || []).map(s => `
                        <tr>
                          <td><strong>${escapeHTML(s.source_acronym || s.source_name)}</strong></td>
                          <td><span class="data-pill-btn">${escapeHTML(s.source_role)}</span></td>
                          <td><span style="font-size:0.75rem; color:#64748b;">${escapeHTML(s.documentary_tier)}</span></td>
                            ${(s.citation_url || s.website_url) ? `<a href="${escapeHTML(s.citation_url || s.website_url)}" target="_blank" style="color:#C82823; font-weight:600;">${escapeHTML(s.citation_reference)} ↗</a>` : escapeHTML(s.citation_reference)}
                            ${s.notes ? `<div style="font-size:0.75rem; color:#475569; margin-top:3px; font-style:italic;">${escapeHTML(s.notes)}</div>` : ''}
                          </td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Ventilations associées -->
              ${(obs.breakdowns || []).length > 0 ? `
                <div class="data-card">
                  <div class="data-card-header">
                    <div class="data-card-title"><i data-lucide="pie-chart"></i> Ventilations Statistiques</div>
                    <span class="data-pill-btn">${obs.breakdowns.length} item(s)</span>
                  </div>
                  <div class="data-table-wrapper">
                    <table class="data-table data-table-sm">
                      <thead>
                        <tr>
                          <th>Dimension</th>
                          <th>Catégorie</th>
                          <th>Valeur</th>
                          <th>Part (%)</th>
                          <th>Rang</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${obs.breakdowns.map(b => `
                          <tr>
                            <td><strong>${escapeHTML(b.dimension_label || '')}</strong></td>
                            <td>${escapeHTML(b.item_label || '')}</td>
                            <td>${b.value_numeric !== null ? formatNumber(b.value_numeric) : '—'}</td>
                            <td>${b.percentage !== null ? b.percentage + '%' : '—'}</td>
                            <td>${b.rank !== null ? '#' + b.rank : '—'}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  </div>
                </div>
              ` : ''}
            </div>

            <!-- Colonne droite : Historique des révisions & Journal des opérations -->
            <div style="display:flex; flex-direction:column; gap:24px;">
              <!-- Instantanés de Versions R(n) -->
              <div class="data-card">
                <div class="data-card-header">
                  <div class="data-card-title"><i data-lucide="layers"></i> Versions Publiées Archivées</div>
                  <span class="data-pill-btn">${versions.length} version(s)</span>
                </div>
                <div style="padding:16px;">
                  ${versions.length === 0 ? `
                    <div style="font-size:0.85rem; color:#64748b; text-align:center; padding:16px;">
                      Aucune révision archivée antérieure. Cette version constitue la référence initiale.
                    </div>
                  ` : versions.map(v => `
                    <div style="padding:10px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; margin-bottom:8px;">
                      <div style="display:flex; justify-content:space-between; font-size:0.84rem;">
                        <strong>Révision R${v.revision_number}</strong>
                        <span style="color:#64748b;">${formatDate(v.published_at)}</span>
                      </div>
                      <div style="font-size:0.95rem; font-weight:800; color:#37463D; margin-top:3px;">
                        ${v.value_numeric !== null ? formatNumber(v.value_numeric) : (v.value_text || v.missing_reason)}
                      </div>
                      ${v.public_reason_summary ? `<div style="font-size:0.78rem; font-style:italic; color:#64748b; margin-top:2px;">« ${escapeHTML(v.public_reason_summary)} »</div>` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Journal d'audit chronologique -->
              <div class="data-card">
                <div class="data-card-header">
                  <div class="data-card-title"><i data-lucide="history"></i> Journal d'Audit des Opérations</div>
                </div>
                <div class="data-activity-stream" style="max-height:400px;">
                  ${auditTrail.length === 0 ? `
                    <div class="data-empty-state">Aucun enregistrement d'audit pour cette observation.</div>
                  ` : auditTrail.map(a => `
                    <div class="data-activity-item">
                      <div class="data-activity-dot"></div>
                      <div class="data-activity-content">
                        <div class="data-activity-header">
                          <strong>${escapeHTML(a.performed_by_username || 'Système')}</strong>
                          a exécuté <code>${escapeHTML(a.action)}</code>
                        </div>
                        ${a.old_status && a.new_status ? `
                          <div style="font-size:0.76rem; color:#475569; margin-top:2px;">
                            ${escapeHTML(a.old_status)} ➔ <strong>${escapeHTML(a.new_status)}</strong>
                          </div>` : ''}
                        ${a.reason ? `<div style="font-size:0.78rem; font-style:italic; color:#64748b; margin-top:2px;">« ${escapeHTML(a.reason)} »</div>` : ''}
                        <div class="data-activity-meta">
                          <i data-lucide="clock" style="width:11px;height:11px;"></i> ${formatDate(a.performed_at, true)}
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
    } catch (e) {
      console.error('Erreur chargement fiche détaillée:', e);
      container.innerHTML = `<div class="data-empty-state" style="color:#dc2626;">Erreur : ${escapeHTML(e.message)}</div>`;
    }
  }

  function returnFromDetail() {
    switchDataTab(State.previousTab || 'observations');
  }

  // ---------------------------------------------------------------------------
  // 14. ACTIONS ET CONFIRMATIONS INTERACTIVES
  // ---------------------------------------------------------------------------
  async function promptSubmit(id) {
    if (!window.Swal) return;
    const confirm = await window.Swal.fire({
      title: 'Soumettre à validation ?',
      text: 'L\'observation passera au statut "under_review" et sera transmise aux examinateurs méthodologiques.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, soumettre',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#37463D'
    });

    if (confirm.isConfirmed) {
      try {
        await DataAdminAPI.submitForReview(id);
        toast('success', 'Observation soumise à validation !');
        loadObservations();
        loadDashboard();
      } catch (e) {
        window.Swal.fire('Erreur de soumission', e.message || 'Impossible de soumettre.', 'error');
      }
    }
  }

  async function promptPublish(id) {
    if (!window.Swal) return;
    const { value: summary } = await window.Swal.fire({
      title: 'Publier l\'observation ?',
      text: 'Cette observation sera rendue publique et accessible sur le portail citoyen.',
      input: 'text',
      inputLabel: 'Synthèse publique ou référence officielle',
      inputPlaceholder: 'Ex: Publication officielle INS Cameroun 2024',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Publier officiellement',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#15803d'
    });

    if (summary !== undefined) {
      try {
        await DataAdminAPI.publishObservation(id, summary.trim());
        toast('success', 'Observation publiée officiellement !');
        loadObservations();
        loadDashboard();
      } catch (e) {
        window.Swal.fire('Erreur de publication', e.message || 'Impossible de publier.', 'error');
      }
    }
  }

  async function promptReject(id) {
    if (!window.Swal) return;
    const { value: reason } = await window.Swal.fire({
      title: 'Rejeter l\'observation ?',
      text: 'Le motif de rejet est obligatoire pour permettre à l\'auteur d\'ajuster ses données.',
      input: 'textarea',
      inputLabel: 'Motif de rejet méthodologique *',
      inputPlaceholder: 'Expliquez précisément les manquements constatés...',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Rejeter l\'observation',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#C82823',
      inputValidator: (val) => {
        if (!val || !val.trim()) return 'Le motif de rejet est obligatoire !';
      }
    });

    if (reason) {
      try {
        await DataAdminAPI.rejectObservation(id, reason.trim());
        toast('info', 'Observation rejetée avec notification du motif.');
        loadValidationQueue();
        loadObservations();
        loadDashboard();
      } catch (e) {
        window.Swal.fire('Erreur', e.message || 'Impossible de rejeter.', 'error');
      }
    }
  }

  async function promptRevise(id) {
    if (!window.Swal) return;
    const { value: reason } = await window.Swal.fire({
      title: 'Créer une révision formelle R(n+1) ?',
      text: 'Un nouveau brouillon de révision sera créé en dupliquant les sources et ventilations.',
      input: 'text',
      inputLabel: 'Motif public de la révision *',
      inputPlaceholder: 'Ex: Actualisation semestrielle consolidée',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Créer la révision',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#37463D',
      inputValidator: (val) => {
        if (!val || !val.trim()) return 'Le motif de révision est obligatoire.';
      }
    });

    if (reason) {
      try {
        const res = await DataAdminAPI.reviseObservation(id, reason.trim());
        toast('success', `Nouvelle révision #${res.data?.id} créée avec succès !`);
        loadObservations();
        loadPublications();
        loadDashboard();
      } catch (e) {
        window.Swal.fire('Erreur de révision', e.message || 'Impossible de créer la révision.', 'error');
      }
    }
  }

  async function promptRevoke(id) {
    if (!window.Swal) return;
    const { value: reason } = await window.Swal.fire({
      title: 'Révoquer publiquement cette observation ?',
      text: 'La donnée sera retirée de la publication active. Le motif public de révocation sera conservé pour intégrité.',
      input: 'textarea',
      inputLabel: 'Motif officiel de révocation *',
      inputPlaceholder: 'Ex: Rectificatif officiel publié par l\'INS annulant la série précédente...',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Confirmer la révocation',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#C82823',
      inputValidator: (val) => {
        if (!val || !val.trim()) return 'Le motif de révocation est obligatoire.';
      }
    });

    if (reason) {
      try {
        await DataAdminAPI.revokeObservation(id, reason.trim());
        toast('info', 'Observation révoquée avec succès.');
        loadPublications();
        loadObservations();
        loadDashboard();
      } catch (e) {
        window.Swal.fire('Erreur de révocation', e.message || 'Impossible de révoquer.', 'error');
      }
    }
  }

  function filterStatus(status) {
    switchDataTab('observations');
    const select = document.getElementById('data-filter-status');
    if (select) {
      select.value = status;
      select.dispatchEvent(new Event('change'));
    }
  }

  // ---------------------------------------------------------------------------
  // 14. MODULE D'IMPORTATION DES DONNÉES (LOT 2D)
  // ---------------------------------------------------------------------------
  let importInitialized = false;

  function initImportView() {
    populateImportDefaults();
    if (!importInitialized) {
      bindImportEvents();
      importInitialized = true;
    }
    loadImportBatchesHistory();
  }

  function populateImportDefaults() {
    const indSelect = document.getElementById('import-def-indicator');
    if (indSelect && indSelect.options.length <= 1) {
      indSelect.innerHTML = '<option value="">-- Aucun (doit figurer dans le fichier) --</option>' +
        State.referentials.indicators.map(i => `<option value="${i.id}">${escapeHTML(i.name)} (${escapeHTML(i.code)})</option>`).join('');
    }

    const terSelect = document.getElementById('import-def-territory');
    if (terSelect && terSelect.options.length <= 1) {
      terSelect.innerHTML = '<option value="">-- Aucun (doit figurer dans le fichier) --</option>' +
        State.referentials.territories.map(t => `<option value="${t.id}">${escapeHTML(t.name)} (${escapeHTML(t.code)})</option>`).join('');
    }

    const srcSelect = document.getElementById('import-def-source');
    if (srcSelect && srcSelect.options.length <= 1) {
      srcSelect.innerHTML = '<option value="">-- Optionnelle --</option>' +
        State.referentials.sources.map(s => `<option value="${s.id}">${escapeHTML(s.name)} (${escapeHTML(s.acronym || '—')})</option>`).join('');
    }
  }

  function bindImportEvents() {
    const dropzone = document.getElementById('import-dropzone');
    const fileInput = document.getElementById('import-file-input');
    const btnNext1 = document.getElementById('btn-import-step1-next');
    const btnNext2 = document.getElementById('btn-import-step2-next');
    const btnApply3 = document.getElementById('btn-import-step3-apply');
    const btnDownloadErr = document.getElementById('btn-import-download-errors');

    if (dropzone && fileInput) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
      dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFileChosen(e.dataTransfer.files[0]);
        }
      });
      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
          handleFileChosen(fileInput.files[0]);
        }
      });
    }

    if (btnNext1) {
      btnNext1.addEventListener('click', handleUploadStep1);
    }
    if (btnNext2) {
      btnNext2.addEventListener('click', handleValidateStep2);
    }
    if (btnApply3) {
      btnApply3.addEventListener('click', handleApplyStep3);
    }
    if (btnDownloadErr) {
      btnDownloadErr.addEventListener('click', handleDownloadErrors);
    }
  }

  function handleFileChosen(file) {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
      toast('warning', 'Format non supporté. Veuillez sélectionner un fichier .csv ou .xlsx/.xls');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast('warning', 'Fichier trop volumineux (maximum 10 Mo autorisés).');
      return;
    }

    State.importWizard.selectedFile = file;

    const badge = document.getElementById('import-file-badge');
    const nameEl = document.getElementById('import-file-name');
    const sizeEl = document.getElementById('import-file-size');
    const btnNext1 = document.getElementById('btn-import-step1-next');

    if (badge && nameEl && sizeEl) {
      nameEl.textContent = file.name;
      sizeEl.textContent = `(${Math.round(file.size / 1024)} Ko)`;
      badge.style.display = 'inline-flex';
    }
    if (btnNext1) btnNext1.disabled = false;
  }

  async function handleUploadStep1() {
    const file = State.importWizard.selectedFile;
    if (!file) {
      toast('warning', 'Veuillez sélectionner un fichier');
      return;
    }

    const btn = document.getElementById('btn-import-step1-next');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Analyse du fichier...';
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const res = await DataAdminAPI.uploadImportFile(file);
      State.importWizard.batch = res.data.batch;
      State.importWizard.headers = res.data.headers || [];
      State.importWizard.previewRows = res.data.previewRows || [];

      // Enregistrer les valeurs de secours
      State.importWizard.defaults = {
        indicator_id: document.getElementById('import-def-indicator')?.value || null,
        territory_id: document.getElementById('import-def-territory')?.value || null,
        period_type: document.getElementById('import-def-period-type')?.value || 'ANNUAL',
        methodology_nature: document.getElementById('import-def-methodology')?.value || 'administrative_record',
        source_id: document.getElementById('import-def-source')?.value || null
      };

      renderMappingStep2();
      goToImportStep(2);
      toast('success', `Fichier analysé : ${State.importWizard.headers.length} colonnes détectées.`);
    } catch (err) {
      toast('danger', err.message || 'Erreur lors de l\'analyse du fichier');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Analyser le fichier et continuer <i data-lucide="arrow-right"></i>';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  function detectBestColumnMatch(targetField, headers) {
    const fieldPatterns = {
      indicator_code: [/indicateur/i, /indicator/i, /code_ind/i, /^code$/i],
      territory_code: [/territoire/i, /territory/i, /region/i, /zone/i, /pays/i],
      year: [/^annee$/i, /^année$/i, /^year$/i, /^an$/i],
      period_start: [/date_debut/i, /debut/i, /period_start/i, /start/i],
      period_end: [/date_fin/i, /fin/i, /period_end/i, /end/i],
      period_type: [/type_periode/i, /period_type/i, /frequence/i],
      value_numeric: [/valeur/i, /montant/i, /value/i, /effectif/i, /total/i, /chiffre/i, /taux/i],
      value_text: [/texte/i, /text/i, /qualitatif/i],
      missing_reason: [/motif/i, /absence/i, /manquant/i, /missing/i],
      methodology_nature: [/methode/i, /nature/i, /methodology/i],
      source_id: [/source/i, /institution/i],
      citation_reference: [/reference/i, /citation/i, /rapport/i],
      notes: [/note/i, /remarque/i, /commentaire/i]
    };

    const patterns = fieldPatterns[targetField] || [];
    for (const h of headers) {
      for (const p of patterns) {
        if (p.test(h)) return h;
      }
    }
    return '';
  }

  function renderMappingStep2() {
    const container = document.getElementById('import-mapping-container');
    if (!container) return;

    const headers = State.importWizard.headers || [];
    const fields = [
      { key: 'indicator_code', label: 'Code Indicateur', req: !State.importWizard.defaults.indicator_id, hint: 'Ex: DEMO_POP_TOT, ECO_PIB_NOM' },
      { key: 'territory_code', label: 'Code Territoire', req: !State.importWizard.defaults.territory_id, hint: 'Ex: CMR, CM-AD, CM-CE' },
      { key: 'year', label: 'Année (ou Date Début)', req: true, hint: 'Ex: 2024 ou 2024-01-01' },
      { key: 'period_end', label: 'Date Fin (Optionnel)', req: false, hint: 'Calculée automatiquement si absente' },
      { key: 'value_numeric', label: 'Montant / Valeur Numérique', req: false, hint: 'Entier ou décimal (ex: 27914536)' },
      { key: 'value_text', label: 'Valeur Textuelle', req: false, hint: 'Pour données qualitatives' },
      { key: 'missing_reason', label: 'Motif d\'absence', req: false, hint: 'not_available, confidential, etc.' },
      { key: 'methodology_nature', label: 'Nature méthodologique', req: false, hint: 'administrative_record, census, etc.' },
      { key: 'source_id', label: 'ID Source Documentaire', req: false, hint: 'ID de l\'institution émettrice' },
      { key: 'notes', label: 'Notes internes', req: false, hint: 'Commentaires de relecture' }
    ];

    const optionsHtml = '<option value="">-- Non mappé (utiliser défaut) --</option>' +
      headers.map(h => `<option value="${escapeHTML(h)}">${escapeHTML(h)}</option>`).join('');

    container.innerHTML = fields.map(f => {
      return `
        <div class="data-mapping-card">
          <div class="data-mapping-card-header">
            <label class="data-mapping-label ${f.req ? 'required' : ''}" for="map-field-${f.key}">${f.label}</label>
            <span class="data-mapping-hint">${f.hint}</span>
          </div>
          <select id="map-field-${f.key}" data-key="${f.key}" class="data-select data-mapping-select">
            ${optionsHtml}
          </select>
        </div>
      `;
    }).join('');

    fields.forEach(f => {
      const match = detectBestColumnMatch(f.key, headers);
      if (match) {
        const el = document.getElementById(`map-field-${f.key}`);
        if (el) el.value = match;
      }
    });
  }

  async function handleValidateStep2() {
    const batchId = State.importWizard.batch?.id;
    if (!batchId) {
      toast('danger', 'Session de lot invalide');
      return;
    }

    const mapping = {};
    document.querySelectorAll('.data-mapping-select').forEach(sel => {
      const key = sel.dataset.key;
      if (sel.value) mapping[key] = sel.value;
    });

    if (!mapping.indicator_code && !State.importWizard.defaults.indicator_id) {
      toast('warning', 'Veuillez associer la colonne Indicateur ou définir un indicateur par défaut.');
      return;
    }
    if (!mapping.territory_code && !State.importWizard.defaults.territory_id) {
      toast('warning', 'Veuillez associer la colonne Territoire ou définir un territoire par défaut.');
      return;
    }
    if (!mapping.year && !mapping.period_start) {
      toast('warning', 'Veuillez associer la colonne Année ou Date de début.');
      return;
    }

    State.importWizard.mapping = mapping;

    const btn = document.getElementById('btn-import-step2-next');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Validation des lignes en cours...';
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const res = await DataAdminAPI.validateImportMapping(batchId, {
        mapping,
        defaults: State.importWizard.defaults
      });

      State.importWizard.validationResult = res.data;
      renderValidationPreviewStep3(res.data);
      goToImportStep(3);
      toast('success', `Analyse terminée : ${res.data.validLines} lignes valides sur ${res.data.totalLines}.`);
    } catch (err) {
      toast('danger', err.message || 'Erreur lors de la validation des données');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Valider et contrôler les lignes <i data-lucide="arrow-right"></i>';
        if (window.lucide) window.lucide.createIcons();
      }
    }
  }

  function renderValidationPreviewStep3(valData) {
    document.getElementById('import-kpi-valid').textContent = formatNumber(valData.validLines || 0);
    document.getElementById('import-kpi-error').textContent = formatNumber(valData.errorLines || 0);
    document.getElementById('import-kpi-total').textContent = formatNumber(valData.totalLines || 0);

    const btnDownloadErr = document.getElementById('btn-import-download-errors');
    if (btnDownloadErr) {
      btnDownloadErr.style.display = valData.errorLines > 0 ? 'inline-flex' : 'none';
    }

    const btnApply = document.getElementById('btn-import-step3-apply');
    if (btnApply) {
      btnApply.disabled = valData.validLines === 0;
      btnApply.innerHTML = `<i data-lucide="database"></i> Confirmer et importer ${valData.validLines} ligne(s) en brouillon`;
    }

    const tbody = document.getElementById('import-preview-tbody');
    if (!tbody) return;

    const previewList = valData.preview || [];
    if (previewList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="data-empty-state">Aucun aperçu disponible.</td></tr>';
      return;
    }

    tbody.innerHTML = previewList.map(row => {
      const isValid = row.status === 'valid';
      const badgeHtml = isValid
        ? '<span class="status-badge" style="background:#dcfce7; color:#166534; border:1px solid #86efac;"><i data-lucide="check"></i> Valide</span>'
        : '<span class="status-badge" style="background:#fee2e2; color:#991b1b; border:1px solid #fca5a5;"><i data-lucide="alert-circle"></i> Erreur</span>';

      const valDisplay = row.preview.value_numeric !== null
        ? formatNumber(row.preview.value_numeric)
        : (row.preview.value_text || (row.preview.missing_reason ? `[Absence: ${row.preview.missing_reason}]` : '—'));

      const errText = row.errors && row.errors.length > 0
        ? `<span style="color:#b91c1c; font-weight:600;">${escapeHTML(row.errors.join(' ; '))}</span>`
        : (row.warnings && row.warnings.length > 0 ? `<span style="color:#b45309;">${escapeHTML(row.warnings.join(' ; '))}</span>` : '<span style="color:#166534;">Conforme</span>');

      return `
        <tr style="${isValid ? '' : 'background:#fff1f2;'}">
          <td><strong>#${row.line_number}</strong></td>
          <td>${badgeHtml}</td>
          <td>${escapeHTML(row.preview.indicator_code || '—')}</td>
          <td>${escapeHTML(row.preview.territory_code || '—')}</td>
          <td>${escapeHTML(row.preview.period_start || '—')}</td>
          <td><strong>${valDisplay}</strong></td>
          <td>${errText}</td>
        </tr>
      `;
    }).join('');

    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  async function handleApplyStep3() {
    const batchId = State.importWizard.batch?.id;
    if (!batchId) return;

    const validCount = State.importWizard.validationResult?.validLines || 0;
    if (!confirm(`Confirmez-vous l'importation de ${validCount} observation(s) au statut BROUILLON (draft) ?\nCes données ne seront pas publiées automatiquement.`)) {
      return;
    }

    const btn = document.getElementById('btn-import-step3-apply');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Ingestion en base de données...';
      if (window.lucide) window.lucide.createIcons();
    }

    try {
      const res = await DataAdminAPI.applyImportBatch(batchId);
      document.getElementById('import-success-summary').textContent =
        `Félicitations : ${res.data.importedCount} observation(s) ont été enregistrées avec succès en brouillon (statut draft, inactives). Elles sont traçables sous le lot d'import #${batchId}.`;

      goToImportStep(4);
      toast('success', `${res.data.importedCount} observations créées en brouillon !`);
      loadDashboard();
    } catch (err) {
      toast('danger', err.message || 'Erreur lors de l\'ingestion des données');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i data-lucide="database"></i> Confirmer et ingérer les lignes valides';
      }
    }
  }

  function handleDownloadErrors() {
    const batchId = State.importWizard.batch?.id;
    if (!batchId) return;
    window.location.href = `${DATA_API_BASE}/admin/imports/${batchId}/rejected.csv`;
  }

  function goToImportStep(stepNum) {
    State.importWizard.currentStep = stepNum;
    for (let i = 1; i <= 4; i++) {
      const pane = document.getElementById(`import-pane-${i}`);
      const ind = document.getElementById(`import-step-ind-${i}`);
      if (pane) pane.style.display = i === stepNum ? 'block' : 'none';
      if (ind) {
        ind.classList.toggle('active', i === stepNum);
        ind.classList.toggle('completed', i < stepNum);
      }
    }
    setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
  }

  function resetImportWizard() {
    State.importWizard = {
      currentStep: 1,
      selectedFile: null,
      batch: null,
      headers: [],
      previewRows: [],
      mapping: {},
      defaults: {},
      validationResult: null
    };

    const fileInput = document.getElementById('import-file-input');
    if (fileInput) fileInput.value = '';

    const badge = document.getElementById('import-file-badge');
    if (badge) badge.style.display = 'none';

    const btnNext1 = document.getElementById('btn-import-step1-next');
    if (btnNext1) btnNext1.disabled = true;

    goToImportStep(1);
    loadImportBatchesHistory();
  }

  async function loadImportBatchesHistory() {
    const tbody = document.getElementById('import-batches-tbody');
    if (!tbody) return;

    try {
      const res = await DataAdminAPI.getImportBatches(15, 0);
      const batches = res.data || [];

      if (batches.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="data-empty-state">Aucun historique d\'importation enregistré.</td></tr>';
        return;
      }

      const statusMap = {
        uploaded: '<span class="status-badge" style="background:#e0f2fe; color:#0369a1;">Téléversé</span>',
        validating: '<span class="status-badge" style="background:#fef3c7; color:#92400e;">En validation</span>',
        validated: '<span class="status-badge" style="background:#fef08a; color:#854d0e;">Prêt (Validé)</span>',
        rejected: '<span class="status-badge" style="background:#fee2e2; color:#991b1b;">Rejeté</span>',
        applied: '<span class="status-badge" style="background:#dcfce7; color:#166534;"><i data-lucide="check"></i> Appliqué</span>',
        reverted: '<span class="status-badge" style="background:#f1f5f9; color:#475569;">Annulé</span>'
      };

      tbody.innerHTML = batches.map(b => {
        const sizeKb = Math.round(b.file_size_bytes / 1024);
        const checksumShort = b.sha256_checksum ? b.sha256_checksum.slice(0, 8) + '...' : '—';
        const hasErrors = b.error_lines > 0;

        return `
          <tr>
            <td><strong>#${b.id}</strong></td>
            <td><strong>${escapeHTML(b.file_name)}</strong></td>
            <td><span style="font-size:0.8rem; color:#64748b;">${sizeKb} Ko • <code style="font-size:0.75rem;">${checksumShort}</code></span></td>
            <td>${statusMap[b.status] || b.status}</td>
            <td>
              <span style="color:#0f172a; font-weight:700;">${b.total_lines}</span> tot. |
              <span style="color:#166534; font-weight:700;">${b.valid_lines}</span> val. |
              <span style="color:#991b1b; font-weight:700;">${b.error_lines}</span> err.
            </td>
            <td>${escapeHTML(b.uploaded_by_username || '—')}</td>
            <td>${formatDate(b.created_at)}</td>
            <td style="text-align:right;">
              ${hasErrors ? `
                <a href="${DATA_API_BASE}/admin/imports/${b.id}/rejected.csv" class="data-btn data-btn-xs data-btn-outline" title="Télécharger les rejets (.csv)">
                  <i data-lucide="download"></i> Rejets
                </a>
              ` : '—'}
            </td>
          </tr>
        `;
      }).join('');

      setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 30);
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" class="data-empty-state" style="color:#ef4444;">Erreur de chargement: ${escapeHTML(err.message)}</td></tr>`;
    }
  }

  // ---------------------------------------------------------------------------
  // 15. EXPOSITION DU MODULE GLOBAL
  // ---------------------------------------------------------------------------
  window.SolitiquoDataAdmin = {
    init: initDataAdmin,
    switchDataTab,
    openEditor,
    goToStep,
    nextStep,
    prevStep,
    setYearPreset,
    setValueType,
    addSourceToEditor,
    removeEditorSource,
    addBreakdownToEditor,
    removeEditorBreakdown,
    saveDraftAction,
    selectValidationObservation,
    openValidationDossier,
    submitValidationDecision,
    submitAuditDecision,
    promptRequestEvidence,
    submitCorrectionRequest,
    submitReviewFromValidation,
    publishFromValidation,
    setValidationFilter,
    filterValidationQueue,
    switchRefTab,
    openDetailView,
    returnFromDetail,
    promptSubmit,
    promptPublish,
    promptReject,
    promptRevise,
    promptRevoke,
    filterStatus,
    resetImportWizard,
    loadImportBatchesHistory,
    goToImportStep,
    switchDocumentarySubTab,
    resetDocFilters,
    openPublicationModal,
    closePublicationModal,
    savePublication,
    deletePublication,
    testPublicationUrl,
    viewPublicationDetails,
    updatePublicationIndicatorsCount,
    loadQualityReport
  };

})(window);
