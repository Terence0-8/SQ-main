/**
 * js/cameroon-map.js - Composant Carte Interactive des 10 Régions du Cameroun
 * Conçu pour l'écosystème Solitiquo (Vanilla JS, Accessible, Responsive)
 */

const CAMEROON_REGIONS_DATA = {
  'CM-EN': {
    code: 'CM-EN',
    name: 'Extrême-Nord',
    capital: 'Maroua',
    population: '3,9 millions',
    departmentsCount: 6,
    departments: ['Diamaré', 'Logone-et-Chari', 'Mayo-Danay', 'Mayo-Kani', 'Mayo-Sava', 'Mayo-Tsanaga'],
    summary: 'Région stratégique du Grand Nord. Carrefour marchand transfrontalier avec le Tchad et le Nigeria, pôle agricole et culturel sahélien.',
    articlesCount: 42,
    keyTopics: ['Sécurité transfrontalière', 'Commerce du lac Tchad', 'Climat & Environnement'],
    leadImage: 'https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?auto=format&fit=crop&w=600&q=80'
  },
  'CM-NO': {
    code: 'CM-NO',
    name: 'Nord',
    capital: 'Garoua',
    population: '2,4 millions',
    departmentsCount: 4,
    departments: ['Bénoué', 'Faro', 'Mayo-Louti', 'Mayo-Rey'],
    summary: 'Bassin cotonnier et agro-industriel majeur. Port fluvial historique de Garoua et grand parc national de la Bénoué.',
    articlesCount: 35,
    keyTopics: ['Filière Coton', 'Énergie hydroélectrique', 'Politiques agricoles'],
    leadImage: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=600&q=80'
  },
  'CM-AD': {
    code: 'CM-AD',
    name: 'Adamaoua',
    capital: 'Ngaoundéré',
    population: '1,2 million',
    departmentsCount: 5,
    departments: ['Djérem', 'Faro-et-Déo', 'Mayo-Banyo', 'Mbéré', 'Vina'],
    summary: 'Château d\'eau du Cameroun et carrefour ferroviaire. Élevage bovin intensif et réserves bauxitiques d\'importance continentale.',
    articlesCount: 28,
    keyTopics: ['Ressources minières', 'Transhumance & Élevage', 'Transports Camrail'],
    leadImage: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=600&q=80'
  },
  'CM-NW': {
    code: 'CM-NW',
    name: 'Nord-Ouest',
    capital: 'Bamenda',
    population: '1,9 million',
    departmentsCount: 7,
    departments: ['Boyo', 'Bui', 'Donga-Mantung', 'Menchum', 'Mezam', 'Momo', 'Ngo-Ketunjia'],
    summary: 'Hauts plateaux anglophones. Agriculture maraîchère dense, artisanat de haut niveau et dynamisme des Chefferies Grassfields.',
    articlesCount: 54,
    keyTopics: ['Décentralisation', 'Agriculture de montagne', 'Patrimoine traditionnel'],
    leadImage: 'https://images.unsplash.com/photo-1509099836639-18ba1795216d?auto=format&fit=crop&w=600&q=80'
  },
  'CM-OU': {
    code: 'CM-OU',
    name: 'Ouest',
    capital: 'Bafoussam',
    population: '1,9 million',
    departmentsCount: 8,
    departments: ['Bamboutos', 'Haut-Nkam', 'Hauts-Plateaux', 'Koung-Khi', 'Menoua', 'Mifi', 'Ndé', 'Noun'],
    summary: 'Cœur de l\'entrepreneuriat et du commerce. Hauts plateaux fertiles, royaumes traditionnels Bamiléké et Bamoun.',
    articlesCount: 48,
    keyTopics: ['Chefferies traditionnelles', 'Microfinance & Commerce', 'Culture & Artisanat'],
    leadImage: 'https://images.unsplash.com/photo-1576085898323-218337e3e43c?auto=format&fit=crop&w=600&q=80'
  },
  'CM-SW': {
    code: 'CM-SW',
    name: 'Sud-Ouest',
    capital: 'Buea',
    population: '1,5 million',
    departmentsCount: 6,
    departments: ['Fako', 'Kupe-Manenguba', 'Lebialem', 'Manyu', 'Meme', 'Ndian'],
    summary: 'Façade maritime occidentale. Mont Cameroun, agro-industrie CDC (banane, cacao, palmier) et pôle numérique Silicon Mountain.',
    articlesCount: 61,
    keyTopics: ['Silicon Mountain (Buea)', 'Agro-industrie CDC', 'Installations pétrolières'],
    leadImage: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80'
  },
  'CM-LT': {
    code: 'CM-LT',
    name: 'Littoral',
    capital: 'Douala',
    population: '3,3 millions',
    departmentsCount: 4,
    departments: ['Moungo', 'Nkam', 'Sanaga-Maritime', 'Wouri'],
    summary: 'Poumon économique du Cameroun et de la zone CEMAC. Port autonome de Douala, Bourse régionale BVMAC et hub industriel.',
    articlesCount: 89,
    keyTopics: ['Port Autonome de Douala', 'Bourse BVMAC', 'Industrie & Commerce'],
    leadImage: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80'
  },
  'CM-CE': {
    code: 'CM-CE',
    name: 'Centre',
    capital: 'Yaoundé',
    population: '4,1 millions',
    departmentsCount: 10,
    departments: ['Haute-Sanaga', 'Lekié', 'Mbam-et-Inoubou', 'Mbam-et-Kim', 'Méfou-et-Afamba', 'Méfou-et-Akono', 'Mfoundi', 'Nyong-et-Kéllé', 'Nyong-et-Mfoumou', 'Nyong-et-So\'o'],
    summary: 'Siège des institutions républicaines, ministères, représentations diplomatiques et grands centres universitaires.',
    articlesCount: 112,
    keyTopics: ['Gouvernance & Lois', 'Diplomatie centrale', 'Projets d\'infrastructures'],
    leadImage: 'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?auto=format&fit=crop&w=600&q=80'
  },
  'CM-ES': {
    code: 'CM-ES',
    name: 'Est',
    capital: 'Bertoua',
    population: '1,0 million',
    departmentsCount: 4,
    departments: ['Boumba-et-Ngoko', 'Haut-Nyong', 'Kadey', 'Lom-et-Djérem'],
    summary: 'Grande réserve forestière et minière (Or, Diamant). Projet du barrage hydroélectrique de Lom Pangar et transition écologique.',
    articlesCount: 31,
    keyTopics: ['Exploitation forestière', 'Barrage Lom Pangar', 'Mines & Ressources'],
    leadImage: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=600&q=80'
  },
  'CM-SU': {
    code: 'CM-SU',
    name: 'Sud',
    capital: 'Ebolowa',
    population: '0,8 million',
    departmentsCount: 4,
    departments: ['Dja-et-Lobo', 'Mvila', 'Océan', 'Vallée-du-Ntem'],
    summary: 'Port en eau profonde de Kribi, complexe siderurgique et hub d\'intégration sous-régionale avec le Gabon et la Guinée Équatoriale.',
    articlesCount: 45,
    keyTopics: ['Port en eau profonde Kribi', 'Intégration CEMAC', 'Filière Cacao'],
    leadImage: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=600&q=80'
  }
};

class CameroonMap {
  constructor(options = {}) {
    this.containerId = options.containerId || 'cm-map-root';
    this.onSelectCallback = options.onSelect || null;
    this.selectedRegionCode = null;
    this.activeRegion = null;

    this.init();
  }

  init() {
    this.container = document.getElementById(this.containerId);
    if (!this.container) return;

    this.createDomStructure();
    this.bindEvents();
  }

  createDomStructure() {
    this.container.innerHTML = `
      <div class="cm-map-wrapper">
        <!-- En-tête -->
        <div class="cm-map-header">
          <div class="cm-map-title-group">
            <h2>
              <span> Carte Interactive du Cameroun</span>
            </h2>
            <p>Cliquez ou survolez une région pour explorer les données et analyses territoriales de Solitiquo.</p>
          </div>
          <span class="cm-map-badge">10 Régions</span>
        </div>

        <!-- Layout principal : Carte SVG + Liste Régions -->
        <div class="cm-map-layout">
          <!-- Zone SVG -->
          <div class="cm-svg-container" id="cm-svg-mount">
            <!-- SVG injecté via fetch ou inline -->
          </div>

          <!-- Panneau latéral / Légende interactive -->
          <div class="cm-region-list" id="cm-region-list">
            ${Object.values(CAMEROON_REGIONS_DATA).map(reg => `
              <div class="cm-region-item" data-region="${reg.code}" tabindex="0" role="button" aria-label="Sélectionner la région ${reg.name}">
                <div class="cm-region-item-info">
                  <div class="cm-region-dot"></div>
                  <div>
                    <div class="cm-region-item-name">${reg.name}</div>
                    <div class="cm-region-item-capital">${reg.capital}</div>
                  </div>
                </div>
                <div class="cm-region-item-badge">${reg.articlesCount} art.</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Tooltip volant -->
        <div class="cm-tooltip" id="cm-tooltip"></div>
      </div>

      <!-- Tiroir latéral (Drawer Info Région) -->
      <div class="cm-drawer-overlay" id="cm-drawer-overlay"></div>
      <div class="cm-drawer" id="cm-drawer" role="dialog" aria-modal="true" aria-labelledby="cm-drawer-title">
        <button class="cm-drawer-close" id="cm-drawer-close" aria-label="Fermer le panneau">&times;</button>
        <div class="cm-drawer-header" id="cm-drawer-header">
          <div class="cm-drawer-header-content">
            <h3 class="cm-drawer-title" id="cm-drawer-title">-</h3>
            <div class="cm-drawer-subtitle" id="cm-drawer-subtitle">-</div>
          </div>
        </div>
        <div class="cm-drawer-body">
          <div class="cm-stats-grid">
            <div class="cm-stat-card">
              <div class="cm-stat-val" id="cm-stat-pop">-</div>
              <div class="cm-stat-lbl">Population estimée</div>
            </div>
            <div class="cm-stat-card">
              <div class="cm-stat-val" id="cm-stat-depts">-</div>
              <div class="cm-stat-lbl">Départements</div>
            </div>
          </div>

          <div>
            <div class="cm-drawer-sec-title">Présentation & Enjeux</div>
            <p style="color:#4A5568;line-height:1.6;font-size:0.92rem;margin:0;" id="cm-drawer-summary">-</p>
          </div>

          <div>
            <div class="cm-drawer-sec-title">Thématiques Clés Solitiquo</div>
            <div class="cm-tags-list" id="cm-drawer-topics"></div>
          </div>

          <div>
            <div class="cm-drawer-sec-title">Départements de la région</div>
            <div class="cm-tags-list" id="cm-drawer-depts-list"></div>
          </div>

          <button class="cm-drawer-cta" id="cm-drawer-cta">
            Voir les ${0} analyses de la région →
          </button>
        </div>
      </div>
    `;

    // Injecter le SVG nettoyé
    fetch('Cameroun.svg')
      .then(res => res.text())
      .then(svgText => {
        document.getElementById('cm-svg-mount').innerHTML = svgText;
        this.bindSvgInteractions();
      })
      .catch(() => {
        console.warn('Chargement SVG distant indisponible, attente de l\'élément svg inline');
      });
  }

  bindEvents() {
    this.tooltip = document.getElementById('cm-tooltip');
    this.drawer = document.getElementById('cm-drawer');
    this.overlay = document.getElementById('cm-drawer-overlay');
    this.closeBtn = document.getElementById('cm-drawer-close');

    // Fermeture tiroir
    this.closeBtn.addEventListener('click', () => this.closeDrawer());
    this.overlay.addEventListener('click', () => this.closeDrawer());

    // Touche Echap pour fermer tiroir
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.drawer.classList.contains('is-open')) {
        this.closeDrawer();
      }
    });

    // Clics sur la liste latérale
    const listItems = this.container.querySelectorAll('.cm-region-item');
    listItems.forEach(item => {
      const code = item.getAttribute('data-region');
      item.addEventListener('click', () => this.selectRegion(code));
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.selectRegion(code);
        }
      });
      item.addEventListener('mouseenter', () => this.highlightRegion(code));
      item.addEventListener('mouseleave', () => this.unhighlightRegion(code));
    });
  }

  bindSvgInteractions() {
    const paths = this.container.querySelectorAll('.cm-region');

    paths.forEach(path => {
      const code = path.getAttribute('data-region');

      path.addEventListener('mouseenter', (e) => {
        this.highlightRegion(code);
        this.showTooltip(e, code);
      });

      path.addEventListener('mousemove', (e) => {
        this.positionTooltip(e);
      });

      path.addEventListener('mouseleave', () => {
        this.unhighlightRegion(code);
        this.hideTooltip();
      });

      path.addEventListener('click', () => {
        this.selectRegion(code);
      });

      path.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.selectRegion(code);
        }
      });
    });
  }

  showTooltip(e, code) {
    const data = CAMEROON_REGIONS_DATA[code];
    if (!data) return;

    this.tooltip.innerHTML = `
      <div class="cm-tooltip-title">${data.name}</div>
      <div class="cm-tooltip-sub">Chef-lieu : <strong>${data.capital}</strong></div>
      <div class="cm-tooltip-stat">📊 ${data.articlesCount} analyses Solitiquo</div>
    `;
    this.tooltip.classList.add('is-visible');
    this.positionTooltip(e);
  }

  positionTooltip(e) {
    const offset = 15;
    let x = e.pageX + offset;
    let y = e.pageY + offset;

    // Débordement écran
    const tooltipRect = this.tooltip.getBoundingClientRect();
    if (x + tooltipRect.width > window.innerWidth) {
      x = e.pageX - tooltipRect.width - offset;
    }
    if (y + tooltipRect.height > window.innerHeight) {
      y = e.pageY - tooltipRect.height - offset;
    }

    this.tooltip.style.left = `${x}px`;
    this.tooltip.style.top = `${y}px`;
  }

  hideTooltip() {
    this.tooltip.classList.remove('is-visible');
  }

  highlightRegion(code) {
    const path = this.container.querySelector(`.cm-region[data-region="${code}"]`);
    const listItem = this.container.querySelector(`.cm-region-item[data-region="${code}"]`);

    if (path) path.classList.add('is-active');
    if (listItem) listItem.classList.add('is-active');
  }

  unhighlightRegion(code) {
    if (this.selectedRegionCode === code) return;

    const path = this.container.querySelector(`.cm-region[data-region="${code}"]`);
    const listItem = this.container.querySelector(`.cm-region-item[data-region="${code}"]`);

    if (path) path.classList.remove('is-active');
    if (listItem) listItem.classList.remove('is-active');
  }

  selectRegion(code) {
    const data = CAMEROON_REGIONS_DATA[code];
    if (!data) return;

    // Désélectionner précédente
    if (this.selectedRegionCode) {
      this.unhighlightRegion(this.selectedRegionCode);
    }

    this.selectedRegionCode = code;
    this.highlightRegion(code);

    // Mettre à jour le tiroir
    document.getElementById('cm-drawer-header').style.backgroundImage = `url('${data.leadImage}')`;
    document.getElementById('cm-drawer-title').textContent = data.name;
    document.getElementById('cm-drawer-subtitle').textContent = `Chef-lieu : ${data.capital} • ${data.departmentsCount} départements`;
    document.getElementById('cm-stat-pop').textContent = data.population;
    document.getElementById('cm-stat-depts').textContent = `${data.departmentsCount} départements`;
    document.getElementById('cm-drawer-summary').textContent = data.summary;

    // Thématiques
    const topicsEl = document.getElementById('cm-drawer-topics');
    topicsEl.innerHTML = data.keyTopics.map(t => `<span class="cm-tag"># ${t}</span>`).join('');

    // Départements
    const deptsEl = document.getElementById('cm-drawer-depts-list');
    deptsEl.innerHTML = data.departments.map(d => `<span class="cm-tag">${d}</span>`).join('');

    // CTA
    const ctaBtn = document.getElementById('cm-drawer-cta');
    ctaBtn.textContent = `Explorer les ${data.articlesCount} analyses de la région →`;
    ctaBtn.onclick = () => {
      if (typeof this.onSelectCallback === 'function') {
        this.onSelectCallback(data);
      } else {
        alert(`Redirection vers la rubrique Solitiquo : ${data.name}`);
      }
    };

    // Ouvrir le tiroir
    this.openDrawer();
  }

  openDrawer() {
    this.drawer.classList.add('is-open');
    this.overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  closeDrawer() {
    this.drawer.classList.remove('is-open');
    this.overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }
}

// Export pour utilisation comme module ou globale
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CameroonMap, CAMEROON_REGIONS_DATA };
} else {
  window.CameroonMap = CameroonMap;
  window.CAMEROON_REGIONS_DATA = CAMEROON_REGIONS_DATA;
}
