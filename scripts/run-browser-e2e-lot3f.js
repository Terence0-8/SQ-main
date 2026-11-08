'use strict';

const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const bcrypt = require('bcrypt');
const app = require('../server');
const pool = require('../backend/config/database');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../tests/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runBrowserTests() {
  console.log('=== SOLITIQUO DATA — LOT 3F : TESTS DE BOUT EN BOUT NAVIGATEUR (CHROME) ===\n');

  // 1. Démarrage serveur de test sur port libre
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`[1/5] Serveur de test démarré sur : ${baseUrl}`);

  // 2. Création d'un administrateur de test pour la session
  const suffix = Date.now().toString().slice(-6);
  const rawPassword = 'AdminPassword123*';
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(rawPassword, salt);

  const uAdmin = await pool.query(`
    INSERT INTO users (username, email, password, role, is_active)
    VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
  `, [`admin_e2e_${suffix}`, `admin_e2e_${suffix}@solitiquo.cm`, hashedPassword]);
  const adminUser = uAdmin.rows[0];
  console.log(`[2/5] Administrateur de test créé : ${adminUser.email}`);

  // 3. Lancement de Chrome
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1280,800']
  });
  console.log('[3/5] Navigateur Google Chrome lancé avec succès (Headless)');

  const errors = [];
  const results = [];

  try {
    const page = await browser.newPage();
    page.on('pageerror', err => {
      console.warn('  ⚠️ Page error:', err.message);
      errors.push({ type: 'pageerror', message: err.message });
    });
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.warn('  ⚠️ Console error:', msg.text());
        errors.push({ type: 'console.error', text: msg.text() });
      }
    });

    // =========================================================================
    // SCÉNARIO 1 : Explorateur Public DATA - Desktop (1280x800)
    // =========================================================================
    console.log('\n--- SCÉNARIO 1 : Explorateur Public DATA (Desktop 1280x800) ---');
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${baseUrl}/data.html`, { waitUntil: 'networkidle2' });

    // Attendre l'apparition des résultats statistiques
    await page.waitForSelector('.data-stat-result-card', { timeout: 10000 });
    const initialCardsCount = await page.$$eval('.data-stat-result-card', cards => cards.length);
    console.log(`  ✓ Cartes statistiques publiées chargées : ${initialCardsCount} carte(s)`);
    results.push({ scenario: 'Catalogue des indicateurs', status: 'PASS', detail: `${initialCardsCount} cartes affichées` });

    // Capture d'écran Explorateur Desktop
    const shotDesktop = path.join(SCREENSHOT_DIR, '01_data_explorer_desktop.png');
    await page.screenshot({ path: shotDesktop, fullPage: false });
    console.log(`  ✓ Capture d'écran enregistrée : ${shotDesktop}`);

    // Test de recherche par mot-clé "PIB"
    console.log('  Testing recherche par mot-clé "PIB"...');
    await page.type('#dataSearchInput', 'PIB');
    await page.waitForFunction(() => {
      const el = document.getElementById('dataSearchStatus');
      return el && el.textContent.includes('observation');
    }, { timeout: 5000 });

    const filteredCards = await page.$$eval('.data-stat-result-card', cards => cards.length);
    console.log(`  ✓ Cartes après recherche "PIB" : ${filteredCards} carte(s)`);
    results.push({ scenario: 'Recherche mot-clé "PIB"', status: 'PASS', detail: `${filteredCards} résultat(s)` });

    // Effacement de la recherche
    await page.click('#dataSearchInput', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll('.data-stat-result-card');
      return cards.length >= 2;
    }, { timeout: 5000 });

    // =========================================================================
    // SCÉNARIO 2 : Ouverture d'une fiche statistique et visualisation graphique
    // =========================================================================
    console.log('\n--- SCÉNARIO 2 : Fiche Statistique Détaillée & Graphiques ---');
    // Cliquer sur la première carte pour ouvrir la modale
    const openBtn = await page.$('.btn-open-modal');
    assert.ok(openBtn, 'Bouton consulter fiche présent');
    await openBtn.click();

    // Attendre l'ouverture de la modal
    await page.waitForSelector('#indicatorDetailModal.is-active', { timeout: 5000 });
    await page.waitForSelector('.modal-ind-header', { timeout: 5000 });
    console.log('  ✓ Modal fiche statistique ouverte avec succès');

    // Vérifier la présence du bloc graphique / repère et de l'historique
    const hasVisual = await page.evaluate(() => {
      return Boolean(document.querySelector('.stat-series-chart-container') || document.querySelector('.stat-chart-single-kpi'));
    });
    console.log(`  ✓ Composant de visualisation graphique présent : ${hasVisual}`);
    results.push({ scenario: 'Visualisation graphique de série', status: hasVisual ? 'PASS' : 'FAIL' });

    // Vérifier les boutons d'export (CSV, JSON, JSON-LD)
    const exportBtns = await page.$$eval('.modal-footer-exports a', links => links.map(l => l.textContent.trim()));
    console.log(`  ✓ Boutons d'export dans la modal : ${exportBtns.join(', ')}`);
    results.push({ scenario: 'Boutons exports modale', status: exportBtns.length >= 3 ? 'PASS' : 'FAIL', detail: exportBtns.join(', ') });

    // Capture d'écran Modal Desktop
    const shotModal = path.join(SCREENSHOT_DIR, '02_data_modal_desktop.png');
    await page.screenshot({ path: shotModal });
    console.log(`  ✓ Capture d'écran enregistrée : ${shotModal}`);

    // Fermeture par la touche Escape
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('indicatorDetailModal').classList.contains('is-active'), { timeout: 3000 });
    console.log('  ✓ Modal fermée avec succès via Escape');

    // =========================================================================
    // SCÉNARIO 3 : Navigation par lien profond (Hash URL)
    // =========================================================================
    console.log('\n--- SCÉNARIO 3 : Lien Profond Hash (#indicator-DEMO_POP_TOT) ---');
    await page.goto(`${baseUrl}/data.html#indicator-DEMO_POP_TOT`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#indicatorDetailModal.is-active', { timeout: 6000 });
    await page.waitForSelector('.modal-ind-title', { timeout: 6000 });
    const modalTitle = await page.$eval('.modal-ind-title', el => el.textContent.trim());
    console.log(`  ✓ Modal ouverte automatiquement par lien d'ancre : "${modalTitle}"`);
    results.push({ scenario: 'Lien profond Hash #indicator-DEMO_POP_TOT', status: 'PASS', detail: modalTitle });

    // Vérifier la présence du graphique SVG multi-points
    const hasSvgChart = await page.evaluate(() => {
      const svg = document.querySelector('.stat-series-chart-container svg');
      return Boolean(svg && svg.querySelectorAll('circle').length >= 2);
    });
    console.log(`  ✓ Graphique SVG multi-points vérifié (continuité/pointillés) : ${hasSvgChart}`);
    results.push({ scenario: 'Graphique SVG chronologique multi-points', status: hasSvgChart ? 'PASS' : 'FAIL' });

    // Fermeture par le bouton &times;
    await page.click('#modalCloseBtn');
    await page.waitForFunction(() => !document.getElementById('indicatorDetailModal').classList.contains('is-active'), { timeout: 3000 });
    console.log('  ✓ Modal fermée avec succès via le bouton de fermeture');

    // =========================================================================
    // SCÉNARIO 4 : Tests Responsive (Tablette 768x1024 & Mobile 375x667)
    // =========================================================================
    console.log('\n--- SCÉNARIO 4 : Tests Responsive Tablette et Smartphone ---');
    // 4.1 Tablette
    await page.setViewport({ width: 768, height: 1024 });
    const shotTablet = path.join(SCREENSHOT_DIR, '03_data_explorer_tablet.png');
    await page.screenshot({ path: shotTablet });
    console.log(`  ✓ Capture Tablette enregistrée (768x1024) : ${shotTablet}`);

    // 4.2 Smartphone
    await page.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
    const shotMobile = path.join(SCREENSHOT_DIR, '04_data_explorer_mobile.png');
    await page.screenshot({ path: shotMobile });
    console.log(`  ✓ Capture Smartphone enregistrée (375x667) : ${shotMobile}`);

    // Ouvrir modal en mode mobile
    await page.click('.btn-open-modal');
    await page.waitForSelector('#indicatorDetailModal.is-active', { timeout: 5000 });
    await page.waitForSelector('.modal-ind-title', { timeout: 5000 });
    const shotModalMobile = path.join(SCREENSHOT_DIR, '05_data_modal_mobile.png');
    await page.screenshot({ path: shotModalMobile });
    console.log(`  ✓ Capture Modal Smartphone enregistrée (375x667) : ${shotModalMobile}`);
    await page.keyboard.press('Escape');

    results.push({ scenario: 'Rendu responsive (Desktop, Tablette, Mobile)', status: 'PASS' });

    // =========================================================================
    // SCÉNARIO 5 : Administration DATA, Tableau de Bord & Diagnostic d'Éligibilité
    // =========================================================================
    console.log('\n--- SCÉNARIO 5 : Parcours Administrateur & Diagnostic d\'Éligibilité ---');
    await page.setViewport({ width: 1280, height: 900 });

    // Connexion admin via session cookie API
    console.log('  Authentification de l\'administrateur...');
    const loginDebug = await page.evaluate(async ({ email, password }) => {
      const csrfRes = await fetch('/api/csrf-token');
      const { csrfToken } = await csrfRes.json();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      const meRes = await fetch('/api/auth/me', { credentials: 'include' });
      const meData = await meRes.json();
      return { loginStatus: res.status, data, meData };
    }, { email: adminUser.email, password: rawPassword });

    console.log('  [DEBUG LOGIN] :', JSON.stringify(loginDebug));
    assert.equal(loginDebug.loginStatus, 200, 'Login HTTP 200');
    assert.equal(loginDebug.meData.isLoggedIn, true, 'isLoggedIn true');
    console.log('  ✓ Authentification administrateur réussie');

    // Aller sur admin.html
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: 'networkidle2' });

    // Basculer sur l'onglet DATA
    await page.evaluate(() => {
      const navItem = document.querySelector('.nav-item[data-view="data"]');
      if (navItem) navItem.click();
      if (window.SolitiquoDataAdmin && typeof window.SolitiquoDataAdmin.switchDataTab === 'function') {
        window.SolitiquoDataAdmin.switchDataTab('dashboard');
      }
    });

    await page.waitForSelector('.data-stats-grid', { timeout: 6000 });
    console.log('  ✓ Onglet DATA et tableau de bord affichés');

    // Attendre que les stats soient chargées par l'API
    await page.waitForFunction(() => {
      const el = document.getElementById('data-stat-pending-arbitration');
      return el && el.textContent.trim() !== '—';
    }, { timeout: 6000 });

    // Vérifier les nouvelles métriques opérationnelles du Lot 3E.4
    const metrics = await page.evaluate(() => {
      return {
        total: document.getElementById('data-stat-total')?.textContent,
        pendingArb: document.getElementById('data-stat-pending-arbitration')?.textContent,
        pendingEv: document.getElementById('data-stat-pending-evidence')?.textContent,
        corrections: document.getElementById('data-stat-corrections')?.textContent,
        readyPub: document.getElementById('data-stat-ready-pub')?.textContent
      };
    });
    console.log('  ✓ Métriques opérationnelles affichées :', metrics);
    assert.ok(metrics.pendingArb && metrics.pendingArb !== '—', 'Métrique pending_arbitration alimentée');

    const shotAdminDash = path.join(SCREENSHOT_DIR, '06_admin_dashboard_data.png');
    await page.screenshot({ path: shotAdminDash });
    console.log(`  ✓ Capture Dashboard Admin enregistrée : ${shotAdminDash}`);

    // Consultation d'un dossier pilote (#693) dans la vue validation de l'admin
    console.log('  Testing ouverture dossier pilote #693 dans l\'admin...');
    await page.evaluate(async (id) => {
      if (window.SolitiquoDataAdmin && typeof window.SolitiquoDataAdmin.openValidationDossier === 'function') {
        await window.SolitiquoDataAdmin.openValidationDossier(id);
      }
    }, 693);

    await page.waitForSelector('#data-validation-dossier .data-card', { timeout: 6000 });
    console.log('  ✓ Dossier d\'inspection pour #693 affiché dans #data-validation-dossier');

    // Vérification du panneau de Diagnostic d'Éligibilité
    const eligibilityInfo = await page.evaluate(() => {
      const dossier = document.getElementById('data-validation-dossier');
      const card = dossier ? dossier.querySelector('.data-card[style*="fef2f2"]') : null;
      const badge = card ? card.querySelector('.data-badge')?.textContent.trim() : null;
      const blockers = card ? Array.from(card.querySelectorAll('li')).map(li => li.textContent.trim()) : [];
      const publishBtn = dossier ? Array.from(dossier.querySelectorAll('button')).find(b => b.textContent.includes('Publier')) : null;
      return { 
        hasCard: Boolean(card), 
        badge, 
        blockersCount: blockers.length, 
        blockers, 
        publishBtnAllowed: Boolean(publishBtn && !publishBtn.disabled) 
      };
    });

    console.log('  ✓ Diagnostic d\'éligibilité pour #693 :', eligibilityInfo);
    assert.ok(eligibilityInfo.hasCard, 'Panneau de diagnostic d\'éligibilité présent');
    assert.equal(eligibilityInfo.badge, '❌ Non Publiable en l\'état');
    assert.ok(eligibilityInfo.blockersCount >= 2, 'Bloqueurs documentaires et méthodologiques identifiés');
    assert.equal(eligibilityInfo.publishBtnAllowed, false, 'Publication directe interdite (non éligible)');

    const shotAdminDossier = path.join(SCREENSHOT_DIR, '07_admin_dossier_eligibility_693.png');
    await page.screenshot({ path: shotAdminDossier });
    console.log(`  ✓ Capture Dossier Éligibilité Admin enregistrée : ${shotAdminDossier}`);

    results.push({ scenario: 'Tableau de bord Admin & Métriques Lot 3E.4', status: 'PASS' });
    results.push({ scenario: 'Diagnostic d\'éligibilité & Verrouillage publication', status: 'PASS' });

  } finally {
    await browser.close();
    server.close();
    // Nettoyage utilisateur de test
    if (adminUser) {
      await pool.query('DELETE FROM users WHERE id = $1', [adminUser.id]);
    }
    await pool.end();
  }

  console.log('\n=== RÉSUMÉ DES TESTS FONCTIONNELS DE BOUT EN BOUT (E2E) ===');
  console.table(results);
  console.log(`\nErreurs consoles/pages détectées : ${errors.length}`);
  if (errors.length > 0) {
    console.warn('Détails des erreurs :', errors);
  }
}

runBrowserTests().catch(err => {
  console.error('\n❌ Échec critique test navigateur E2E :', err);
  process.exit(1);
});
