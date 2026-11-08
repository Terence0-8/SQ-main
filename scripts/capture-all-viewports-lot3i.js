'use strict';

const puppeteer = require('puppeteer-core');
const http = require('http');
const app = require('../server');
const pool = require('../backend/config/database');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SCREENSHOT_DIR = path.resolve(__dirname, '../tests/screenshots');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('--- CAPTURE DES CAPTURES D\'ÉCRAN MULTI-RÉSOLUTIONS (LOT 3I) ---');

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Serveur temporaire lancé sur ${baseUrl}`);

  // Création temporaire d'un administrateur avec mot de passe hashé
  const suffix = Date.now().toString().slice(-6);
  const rawPassword = 'AdminPassword123*';
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(rawPassword, salt);

  const uAdmin = await pool.query(`
    INSERT INTO users (username, email, password, role, is_active)
    VALUES ($1, $2, $3, 'admin', TRUE) RETURNING id, username, email, role
  `, [`admin_viewport_${suffix}`, `admin_viewport_${suffix}@solitiquo.cm`, hashedPassword]);
  const adminUser = uAdmin.rows[0];
  console.log(`Admin de test créé: ${adminUser.username} (id: ${adminUser.id})`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    await page.setViewport({ width: 1440, height: 900 });

    // 1. Authentification
    console.log('Connexion admin via API...');
    await page.goto(`${baseUrl}/auth.html`, { waitUntil: 'networkidle2' });
    const loginRes = await page.evaluate(async ({ email, password }) => {
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
      return res.json();
    }, { email: adminUser.email, password: rawPassword });

    console.log('Login result:', loginRes.success ? 'SUCCESS' : 'FAILED');

    // 2. Navigation vers admin.html
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: 'networkidle2' });
    await wait(1200);

    // 3. Basculement vers l'onglet DATA
    console.log('Clic sur Solitiquo DATA...');
    await page.evaluate(() => {
      const dataNavItem = document.querySelector('.nav-item[data-view="data"]');
      if (dataNavItem) dataNavItem.click();
    });
    await wait(3000);

    // Vérifier l'état du DOM
    const domState = await page.evaluate(() => {
      const scoreVal = document.getElementById('quality-score-value');
      const statusPill = document.getElementById('quality-status-pill');
      const total = document.getElementById('data-stat-total');
      const draft = document.getElementById('data-stat-draft');
      const published = document.getElementById('data-stat-published');
      const reconText = document.getElementById('data-reconciliation-text');
      const brandLogo = document.querySelector('.brand-logo');
      return {
        score: scoreVal ? scoreVal.textContent : null,
        status: statusPill ? statusPill.textContent : null,
        total: total ? total.textContent : null,
        draft: draft ? draft.textContent : null,
        published: published ? published.textContent : null,
        recon: reconText ? reconText.innerText : null,
        brandSrc: brandLogo ? brandLogo.src : null
      };
    });
    console.log('DOM STATE CHARGÉ:', domState);

    // 4. Capture 1: Desktop 1440x900
    console.log('Capture 1: Desktop 1440x900...');
    await page.setViewport({ width: 1440, height: 900 });
    await wait(600);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin_desktop_1440_lot3i.png'),
      fullPage: false
    });

    // 5. Capture 2: Laptop 1366x768
    console.log('Capture 2: Laptop 1366x768...');
    await page.setViewport({ width: 1366, height: 768 });
    await wait(600);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin_laptop_1366_lot3i.png'),
      fullPage: false
    });

    // 6. Capture 3: Tablet 768x1024
    console.log('Capture 3: Tablet 768x1024...');
    await page.setViewport({ width: 768, height: 1024 });
    await wait(600);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin_tablet_768_lot3i.png'),
      fullPage: false
    });

    // 7. Capture 4: Mobile 375x667
    console.log('Capture 4: Mobile 375x667...');
    await page.setViewport({ width: 375, height: 667 });
    await wait(600);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin_mobile_375_lot3i.png'),
      fullPage: false
    });

    // 8. Capture 5: Mobile avec Sidebar ouverte
    console.log('Capture 5: Mobile sidebar ouvert...');
    await page.evaluate(() => {
      const toggleBtn = document.getElementById('btn-toggle-sidebar');
      if (toggleBtn) toggleBtn.click();
    });
    await wait(600);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin_mobile_sidebar_open_lot3i.png'),
      fullPage: false
    });

    // 9. Capture 6: Zoom Widget Qualité (Desktop 1440)
    console.log('Capture 6: Zoom Widget Qualité...');
    await page.setViewport({ width: 1440, height: 1200 });
    await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar && sidebar.classList.contains('open')) {
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) overlay.click();
      }
      const card = document.getElementById('editorial-quality-card');
      if (card) card.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await wait(600);

    const qualityCardHandle = await page.$('#editorial-quality-card');
    if (qualityCardHandle) {
      await qualityCardHandle.screenshot({
        path: path.join(SCREENSHOT_DIR, 'admin_quality_widget_lot3i.png')
      });
    }

    // 10. Capture 7: Zoom Sous-navigation et Métriques (Desktop 1440)
    console.log('Capture 7: Zoom Sous-navigation et Métriques...');
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await wait(600);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin_subnav_counters_lot3i.png'),
      clip: { x: 260, y: 70, width: 1160, height: 440 }
    });

    // 11. Capture 8: Full Page After Lot 3I
    console.log('Capture 8: Full page after lot 3i...');
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin_data_after_lot3i.png'),
      fullPage: true
    });

    console.log('=== TOUTES LES CAPTURES ONT ÉTÉ GÉNÉRÉES AVEC SUCCÈS DANS tests/screenshots/ ===');

  } catch (err) {
    console.error('Erreur durant les captures:', err);
    throw err;
  } finally {
    await browser.close();
    server.close();
    await pool.query('DELETE FROM users WHERE id = $1', [adminUser.id]);
    console.log('Nettoyage serveur et utilisateur temporaire terminé.');
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
